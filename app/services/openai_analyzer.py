import json
from dataclasses import dataclass
from difflib import SequenceMatcher
import unicodedata

from openai import OpenAI

from app.core.config import get_settings
from app.schemas import NumberedAnswers, QuestionnaireFields, ServiceAssessment, SurveyAnalysis, TopicItem
from app.services.storage import PreparedDocument


settings = get_settings()
QUALITY_SCORE_MAP = {
    "excelente": 5.0,
    "bueno": 4.0,
    "regular": 3.0,
    "malo": 1.0,
    "deficiente": 2.0,
    "critico": 1.0,
    "sin_dato": None,
}


class AnalyzerError(RuntimeError):
    pass


@dataclass
class AnalyzerContext:
    services: list[str]
    departments: list[str]


class BaseAnalyzer:
    def analyze(self, document: PreparedDocument, context: AnalyzerContext) -> SurveyAnalysis:
        raise NotImplementedError


class MockAnalyzer(BaseAnalyzer):
    def analyze(self, document: PreparedDocument, context: AnalyzerContext) -> SurveyAnalysis:
        filename = document.original_filename.lower()
        survey_type = "neutral"
        sentiment = "neutral"
        has_negative_comment = False
        suggestions: list[TopicItem] = []
        complaints: list[TopicItem] = []
        negative_comments: list[TopicItem] = []

        if "suger" in filename:
            survey_type = "sugerencia"
            sentiment = "positivo"
            suggestions = [TopicItem(text="Modo simulación: pendiente usar OpenAI real.", frequency_hint="media")]
        elif "queja" in filename:
            survey_type = "queja"
            sentiment = "negativo"
            has_negative_comment = True
            complaints = [TopicItem(text="Modo simulación: se detectó por el nombre del archivo.", frequency_hint="media")]
            negative_comments = [TopicItem(text="Modo simulación: revisar con API real.", frequency_hint="media")]

        services = [
            ServiceAssessment(
                service_name=service_name,
                mentioned=False,
                quality_level="sin_dato",
                score=None,
                summary="Sin análisis real: configura OPENAI_API_KEY para evaluar este servicio.",
            )
            for service_name in context.services
        ]

        return SurveyAnalysis(
            department=context.departments[0] if context.departments else "Sin especificar",
            survey_type=survey_type,
            sentiment=sentiment,
            has_negative_comment=has_negative_comment,
            overall_quality_level="sin_dato",
            overall_quality_score=None,
            executive_summary="El sistema está en modo simulación. Guarda una nueva API key válida en .env para clasificar documentos reales.",
            conclusions=[
                "No se ejecutó análisis documental real porque OPENAI_API_KEY no está configurada."
            ],
            questionnaire=QuestionnaireFields(
                document_number=None,
                visitor_name=None,
                affiliate_text=None,
                affiliate_status="sin_dato",
                visit_date=None,
                email=None,
                phone=None,
                room_number=None,
                visit_reason=None,
                selected_contexts=[],
                recommends_hostales="sin_dato",
                had_difficulty="sin_dato",
                difficulty_detail=None,
                issue_resolved_in_time="sin_dato",
                collaborator_caused_issue="sin_dato",
                attendant_role=None,
                attendant_name=None,
                improvement_comment=None,
            ),
            numbered_answers=NumberedAnswers(
                item_1=None,
                item_2=None,
                item_3=None,
                item_4=None,
                item_5=None,
                item_6=None,
                item_7=None,
                item_8=None,
                item_9=None,
                item_10=None,
                item_11=None,
                item_12=None,
                item_13=None,
                item_14=None,
            ),
            suggestions=suggestions,
            complaints=complaints,
            negative_comments=negative_comments,
            services=services,
            extracted_text="Modo simulación activo.",
        )


class OpenAIAnalyzer(BaseAnalyzer):
    def __init__(self) -> None:
        if not settings.openai_api_key:
            raise AnalyzerError("No se ha configurado OPENAI_API_KEY.")
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.openai_timeout_seconds,
            max_retries=1,
        )

    def analyze(self, document: PreparedDocument, context: AnalyzerContext) -> SurveyAnalysis:
        if document.mime_type == "application/pdf":
            content: list[dict[str, object]] = [
                {
                    "type": "input_text",
                    "text": self._user_prompt(context, None),
                }
            ]
            with document.source_path.open("rb") as file_handle:
                file_resource = self.client.files.create(file=file_handle, purpose="user_data")
            content.append({"type": "input_file", "file_id": file_resource.id})
            transcription_text = None
        else:
            transcription_text = self._transcribe_image(document)
            content = self._build_image_content(
                prompt_text=self._user_prompt(context, transcription_text),
                document=document,
            )

        response = self.client.responses.create(
            model=settings.openai_model,
            store=False,
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": self._system_prompt(context),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": content,
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "survey_analysis",
                    "strict": True,
                    "schema": _make_openai_strict_schema(SurveyAnalysis.model_json_schema()),
                }
            },
        )

        try:
            analysis = SurveyAnalysis.model_validate_json(response.output_text)
        except Exception as exc:  # noqa: BLE001
            raise AnalyzerError("La respuesta de OpenAI no vino en el formato esperado.") from exc

        if transcription_text and len(transcription_text.strip()) > len((analysis.extracted_text or "").strip()):
            analysis = analysis.model_copy(update={"extracted_text": transcription_text})
        return self._complete_missing_services(analysis, context.services)

    def _complete_missing_services(
        self,
        analysis: SurveyAnalysis,
        services_catalog: list[str],
    ) -> SurveyAnalysis:
        mapped = {
            _normalize_key(service.service_name): service
            for service in analysis.services
        }
        unmatched = list(mapped.items())
        normalized_services = []
        for service_name in services_catalog:
            current = mapped.get(_normalize_key(service_name))
            if not current:
                current = _best_service_match(service_name, unmatched)
            if current:
                score = current.score
                if score is None:
                    score = QUALITY_SCORE_MAP.get(current.quality_level)
                normalized_services.append(
                    ServiceAssessment(
                        service_name=service_name,
                        mentioned=current.mentioned,
                        quality_level=current.quality_level,
                        score=score,
                        summary=current.summary or f"Marcado como {current.quality_level}.",
                    )
                )
            else:
                normalized_services.append(
                    ServiceAssessment(
                        service_name=service_name,
                        mentioned=False,
                        quality_level="sin_dato",
                        score=None,
                        summary="No se encontró evidencia suficiente en el documento.",
                    )
                )

        return analysis.model_copy(update={"services": normalized_services})

    def _system_prompt(self, context: AnalyzerContext) -> str:
        departments = ", ".join(context.departments) if context.departments else "Sin catálogo cerrado"
        services = "\n".join(f"- {service}" for service in context.services)
        return (
            "Eres un analista experto en encuestas de calidad de servicio. "
            "Debes leer documentos escaneados o PDFs de encuestas y entregar solo JSON válido.\n"
            "Objetivos:\n"
            "1. Extraer los campos de identificación del visitante y del formulario.\n"
            "2. Capturar explícitamente todas las respuestas numeradas de la boleta del 1 al 14.\n"
            "3. Interpretar la matriz de calificación de servicios.\n"
            "4. Clasificar si el documento contiene sugerencias, quejas, ambas o ninguna.\n"
            "5. Identificar el departamento principal.\n"
            "6. Detectar comentarios negativos o inconformidades.\n"
            "7. Generar conclusiones ejecutivas breves.\n"
            "Reglas:\n"
            "- Este formulario es una boleta de satisfacción de Los Hostales del IRTRA.\n"
            "- La tabla usa las columnas Excelente, Bueno, Regular y Malo. Un slash, una X, una palomita o una línea diagonal dentro de una celda cuenta como selección.\n"
            "- Si en una fila hay más de una marca, usa la valoración más negativa y menciona la ambigüedad en summary.\n"
            "- Si falta evidencia, usa 'sin_dato'.\n"
            "- No inventes servicios fuera del catálogo.\n"
            "- Si no hay departamento claro, usa 'Sin especificar'.\n"
            "- questionnaire debe contener los campos interpretados del formulario.\n"
            "- numbered_answers debe contener el contenido de cada pregunta numerada 1 a 14, aun si solo puedes resumirlo.\n"
            "- Clasifica como queja cuando haya servicios en regular o malo, respuestas negativas, dificultades, inconformidades o comentarios de problema.\n"
            "- Clasifica como sugerencia cuando haya recomendaciones de mejora o comentarios propositivos aunque no exista queja.\n"
            "- extracted_text debe contener el texto más fiel posible visible en el documento.\n"
            f"Catálogo de departamentos sugerido: {departments}\n"
            "Catálogo de servicios obligatorio:\n"
            f"{services}"
        )

    def _user_prompt(self, context: AnalyzerContext, transcription_text: str | None) -> str:
        services = ", ".join(context.services)
        departments = ", ".join(context.departments) if context.departments else "libre"
        transcription_block = ""
        if transcription_text:
            transcription_block = (
                "\nUsa también esta transcripción OCR/manuscrita previa como apoyo, "
                "pero prioriza siempre lo que veas en las imágenes si hay conflicto:\n"
                f"{transcription_text}\n"
            )
        return (
            "Analiza esta encuesta de satisfacción y responde usando el esquema JSON solicitado. "
            "Extrae el número de boleta, todos los datos de las preguntas 1 a 14 y la tabla de servicios. "
            "En numbered_answers debes llenar item_1 hasta item_14 respetando la numeración del formulario. "
            "Para el formulario actual, las preguntas incluyen nombre, afiliado, fecha, contacto, razón de visita, matriz de servicios, recomendación, dificultad, detalle, resolución, inconveniente con colaborador, quién atendió, nombre del colaborador y mejora sugerida. "
            "Para cada servicio, convierte la marca encontrada a quality_level y score: Excelente=5, Bueno=4, Regular=3, Malo=1. "
            "Si una respuesta manuscrita dice que no hubo dificultad o no hubo inconveniente, no la clasifiques como queja salvo que la tabla contenga regular o malo. "
            "Genera sugerencias usando la respuesta de mejora y comentarios propositivos. "
            "Genera quejas usando dificultades, problemas no resueltos, mala atención o servicios mal evaluados. "
            "Genera negative_comments usando frases de molestia, problema o inconformidad. "
            "Si no se distingue bien un dato manuscrito, usa null o sin_dato antes que inventarlo. "
            "Pon especial atención al texto manuscrito en lapicero, aunque sea tenue. "
            f"Servicios válidos: {services}. "
            f"Departamentos preferidos: {departments}."
            f"{transcription_block}"
        )

    def _transcribe_image(self, document: PreparedDocument) -> str:
        image_content = self._build_image_content(
            prompt_text=(
                "Transcribe todo el texto visible de esta boleta, incluyendo texto impreso y manuscrito. "
                "Conserva la numeración del formulario, nombres propios, números, correos, teléfonos y respuestas cortas. "
                "Si un texto manuscrito es dudoso, márcalo entre corchetes con un signo de interrogación, por ejemplo [Córdona?]. "
                "Describe también las marcas de la tabla de servicios fila por fila y las casillas marcadas."
            ),
            document=document,
        )
        response = self.client.responses.create(
            model=settings.openai_model,
            store=False,
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "Eres un transcriptor experto en formularios escaneados y escritura manuscrita en español. "
                                "Debes priorizar legibilidad y fidelidad antes que resumir."
                            ),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": image_content,
                },
            ],
        )
        return (response.output_text or "").strip()

    def _build_image_content(
        self,
        prompt_text: str,
        document: PreparedDocument,
    ) -> list[dict[str, object]]:
        if not document.analysis_images:
            if not document.data_url:
                raise AnalyzerError("No se pudo preparar la imagen para OpenAI.")
            document.analysis_images = [("Imagen completa", document.data_url)]

        content: list[dict[str, object]] = [
            {
                "type": "input_text",
                "text": prompt_text,
            }
        ]
        detail_level = self._image_detail_level()
        for label, image_url in document.analysis_images:
            content.append(
                {
                    "type": "input_text",
                    "text": label,
                }
            )
            content.append(
                {
                    "type": "input_image",
                    "image_url": image_url,
                    "detail": detail_level,
                }
            )
        return content

    def _image_detail_level(self) -> str:
        if settings.openai_model.startswith("gpt-5.4"):
            return "original"
        return "high"


def build_analyzer() -> BaseAnalyzer:
    if settings.openai_api_key:
        return OpenAIAnalyzer()
    return MockAnalyzer()


def analysis_to_json(analysis: SurveyAnalysis) -> str:
    return json.dumps(analysis.model_dump(), ensure_ascii=False, indent=2)


def _normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    cleaned = "".join(character if character.isalnum() or character.isspace() else " " for character in normalized.lower())
    return " ".join(cleaned.split())


def _best_service_match(
    service_name: str,
    unmatched: list[tuple[str, ServiceAssessment]],
) -> ServiceAssessment | None:
    target = _normalize_key(service_name)
    best_score = 0.0
    best_match: ServiceAssessment | None = None
    for candidate_key, candidate_service in unmatched:
        score = SequenceMatcher(None, target, candidate_key).ratio()
        if target in candidate_key or candidate_key in target:
            score = max(score, 0.9)
        if score > best_score:
            best_score = score
            best_match = candidate_service

    if best_score >= 0.7:
        return best_match
    return None


def _make_openai_strict_schema(schema: dict[str, object]) -> dict[str, object]:
    if not isinstance(schema, dict):
        return schema

    schema_copy = dict(schema)
    properties = schema_copy.get("properties")
    if isinstance(properties, dict):
        normalized_properties: dict[str, object] = {}
        for key, value in properties.items():
            if isinstance(value, dict):
                normalized_properties[key] = _make_openai_strict_schema(value)
            else:
                normalized_properties[key] = value
        schema_copy["properties"] = normalized_properties
        schema_copy["required"] = list(normalized_properties.keys())
        schema_copy["additionalProperties"] = False

    items = schema_copy.get("items")
    if isinstance(items, dict):
        schema_copy["items"] = _make_openai_strict_schema(items)

    any_of = schema_copy.get("anyOf")
    if isinstance(any_of, list):
        schema_copy["anyOf"] = [
            _make_openai_strict_schema(item) if isinstance(item, dict) else item
            for item in any_of
        ]

    defs = schema_copy.get("$defs")
    if isinstance(defs, dict):
        schema_copy["$defs"] = {
            key: _make_openai_strict_schema(value) if isinstance(value, dict) else value
            for key, value in defs.items()
        }

    return schema_copy
