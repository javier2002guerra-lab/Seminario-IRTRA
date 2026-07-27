import json
import hashlib
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import BackgroundTasks, FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.catalog import ensure_catalog, load_catalog, save_catalog
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.models import ServiceObservation, SurveyRecord, TopicObservation
from app.schemas import SurveyAnalysis
from app.services.analytics import build_dashboard_payload
from app.services.excel_export import build_excel_report, list_excel_templates, save_excel_template
from app.services.openai_analyzer import AnalyzerContext, analysis_to_json, build_analyzer
from app.services.scanner import capture_scan, detect_scanner
from app.services.storage import FileValidationError, prepare_document_for_ai, save_upload


settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.debug)
BASE_PATH = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE_PATH / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_PATH / "templates"))

PORTAL_NAV = [
    {"key": "overview", "href": "/overview", "label": "Resumen", "tag": "Control"},
    {"key": "intake", "href": "/intake", "label": "Carga", "tag": "Entrada"},
    {"key": "analytics", "href": "/analytics", "label": "Analítica", "tag": "Calidad"},
    {"key": "findings", "href": "/findings", "label": "Hallazgos", "tag": "Tendencias"},
    {"key": "forms", "href": "/forms", "label": "Boletas", "tag": "Digitalización"},
    {"key": "settings", "href": "/settings", "label": "Catálogo", "tag": "Configuración"},
]


def main() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)


@app.on_event("startup")
def startup_event() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    ensure_catalog()


@app.get("/", include_in_schema=False)
def dashboard_root() -> RedirectResponse:
    return RedirectResponse(url="/overview", status_code=307)


@app.get("/overview", response_class=HTMLResponse)
def overview(request: Request) -> HTMLResponse:
    return _render_portal_page(
        request=request,
        template_name="overview.html",
        active_page="overview",
        page_eyebrow="Centro de control",
        page_title="Resumen ejecutivo",
        page_description=(
            "Supervisa el estado del procesamiento, el volumen de encuestas y el pulso general "
            "de calidad desde una vista de alto nivel."
        ),
    )


@app.get("/intake", response_class=HTMLResponse)
def intake(request: Request) -> HTMLResponse:
    return _render_portal_page(
        request=request,
        template_name="intake.html",
        active_page="intake",
        page_eyebrow="Entrada documental",
        page_title="Carga y digitalización",
        page_description=(
            "Sube boletas escaneadas, usa el modo escáner y controla la entrada de formularios "
            "que serán convertidos en datos estructurados."
        ),
    )


@app.get("/analytics", response_class=HTMLResponse)
def analytics(request: Request) -> HTMLResponse:
    return _render_portal_page(
        request=request,
        template_name="analytics.html",
        active_page="analytics",
        page_eyebrow="Calidad del servicio",
        page_title="Analítica operativa",
        page_description=(
            "Explora el rendimiento de cada servicio, compara departamentos y detecta "
            "las áreas donde la experiencia del visitante necesita atención."
        ),
    )


@app.get("/findings", response_class=HTMLResponse)
def findings(request: Request) -> HTMLResponse:
    return _render_portal_page(
        request=request,
        template_name="findings.html",
        active_page="findings",
        page_eyebrow="Clasificación inteligente",
        page_title="Hallazgos y tendencias",
        page_description=(
            "Consulta sugerencias, quejas e inconformidades agrupadas por frecuencia para "
            "convertir comentarios dispersos en señales accionables."
        ),
    )


@app.get("/forms", response_class=HTMLResponse)
def forms(request: Request) -> HTMLResponse:
    return _render_portal_page(
        request=request,
        template_name="forms.html",
        active_page="forms",
        page_eyebrow="Boletas digitalizadas",
        page_title="Vista espejo de formularios",
        page_description=(
            "Revisa cada encuesta como una boleta digital, con la misma estructura visual del papel "
            "pero ya lista para consulta y seguimiento."
        ),
    )


@app.get("/settings", response_class=HTMLResponse)
def settings_view(request: Request) -> HTMLResponse:
    return _render_portal_page(
        request=request,
        template_name="settings.html",
        active_page="settings",
        page_eyebrow="Configuración",
        page_title="Catálogo y parámetros",
        page_description=(
            "Administra servicios, departamentos y la estructura base del formulario "
            "para que el sistema siga alineado con la operación real."
        ),
    )


def dashboard(request: Request) -> HTMLResponse:
    catalog = load_catalog()
    scanner_status = detect_scanner()
    with SessionLocal() as db:
        payload = build_dashboard_payload(db, catalog["services"])
    digital_forms = [
        _build_form_snapshot(record, catalog["services"])
        for record in payload["recent_records"]
    ]

    return templates.TemplateResponse(
        request=request,
        name="overview.html",
        context={
            "app_name": settings.app_name,
            "catalog": catalog,
            "scanner_status": scanner_status,
            "payload": payload,
            "digital_forms": digital_forms,
            "active_page": "overview",
            "portal_nav": PORTAL_NAV,
            "page_eyebrow": "Centro de control",
            "page_title": "Resumen ejecutivo",
            "page_description": "Vista de alto nivel del sistema.",
            "message": request.query_params.get("message"),
            "kind": request.query_params.get("kind", "info"),
        },
    )


@app.post("/catalog")
async def update_catalog(
    services_text: str = Form(...),
    departments_text: str = Form(""),
) -> RedirectResponse:
    services = [line.strip() for line in services_text.splitlines() if line.strip()]
    departments = [line.strip() for line in departments_text.splitlines() if line.strip()]
    try:
        save_catalog(services, departments)
        message = quote("Catálogo actualizado correctamente.")
        kind = "success"
    except ValueError as exc:
        message = quote(str(exc))
        kind = "error"
    return RedirectResponse(url=f"/settings?message={message}&kind={kind}", status_code=303)


@app.post("/templates/upload")
async def upload_excel_template(file: UploadFile = File(...)) -> RedirectResponse:
    try:
        content = await file.read()
        save_excel_template(file.filename or "plantilla.xlsm", content)
        message = quote("Plantilla gerencial cargada correctamente.")
        kind = "success"
    except ValueError as exc:
        message = quote(str(exc))
        kind = "error"
    return RedirectResponse(url=f"/settings?message={message}&kind={kind}", status_code=303)


@app.post("/upload")
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    intake_mode: str = Form("upload"),
) -> RedirectResponse:
    created = 0
    messages: list[str] = []

    for file in files:
        try:
            saved = await save_upload(file)
        except FileValidationError as exc:
            messages.append(f"{file.filename}: {exc}")
            continue

        with SessionLocal() as db:
            duplicate = db.scalar(
                select(SurveyRecord).where(SurveyRecord.sha256_hash == saved.sha256_hash)
            )
            if duplicate:
                saved.storage_path.unlink(missing_ok=True)
                messages.append(f"{saved.original_filename}: archivo duplicado omitido.")
                continue

            record = SurveyRecord(
                original_filename=saved.original_filename,
                stored_filename=saved.stored_filename,
                storage_path=str(saved.storage_path),
                mime_type=saved.mime_type,
                extension=saved.extension,
                file_size=saved.file_size,
                sha256_hash=saved.sha256_hash,
                intake_mode=intake_mode,
                status="queued",
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            record_id = record.id

        background_tasks.add_task(process_record, record_id)
        created += 1

    if created:
        messages.insert(0, f"{created} archivo(s) enviado(s) a procesamiento.")
        kind = "success"
    else:
        kind = "error"

    message = quote(" ".join(messages) if messages else "No se recibió ningún archivo válido.")
    return RedirectResponse(url=f"/intake?message={message}&kind={kind}", status_code=303)


@app.post("/scanner/capture")
def scanner_capture(background_tasks: BackgroundTasks) -> RedirectResponse:
    filename = f"{uuid.uuid4().hex}.png"
    path = settings.upload_dir / filename
    try:
        scanned = capture_scan(path.parent)
    except Exception as exc:  # noqa: BLE001
        message = quote(str(exc))
        return RedirectResponse(url=f"/intake?message={message}&kind=error", status_code=303)

    if scanned != path:
        scanned.rename(path)

    record_id = _register_scanned_file(path, filename)
    background_tasks.add_task(process_record, record_id)
    message = quote("Escaneo enviado a procesamiento.")
    return RedirectResponse(url=f"/intake?message={message}&kind=success", status_code=303)


@app.get("/records/{record_id}", response_class=HTMLResponse)
def record_detail(request: Request, record_id: int) -> HTMLResponse:
    with SessionLocal() as db:
        record = db.scalar(
            select(SurveyRecord)
            .options(
                selectinload(SurveyRecord.services),
                selectinload(SurveyRecord.topics),
            )
            .where(SurveyRecord.id == record_id)
        )
        if not record:
            return RedirectResponse(url="/forms?message=Registro%20no%20encontrado&kind=error", status_code=303)
    analysis_payload = _parse_analysis_payload(record.ai_response_json)
    return templates.TemplateResponse(
        request=request,
        name="record_detail.html",
        context={
            "record": record,
            "app_name": settings.app_name,
            "analysis_payload": analysis_payload,
        },
    )


@app.get("/records/{record_id}/download")
def download_original(record_id: int) -> FileResponse:
    with SessionLocal() as db:
        record = db.get(SurveyRecord, record_id)
        if not record:
            return RedirectResponse(url="/forms?message=Registro%20no%20encontrado&kind=error", status_code=303)
    return FileResponse(record.storage_path, filename=record.original_filename)


@app.get("/export/excel", response_model=None)
def export_excel(year: int | None = None):
    catalog = load_catalog()
    try:
        with SessionLocal() as db:
            report = build_excel_report(db, catalog["services"], year=year)
    except FileNotFoundError as exc:
        message = quote(str(exc))
        return RedirectResponse(url=f"/settings?message={message}&kind=error", status_code=303)
    headers = {"Content-Disposition": f'attachment; filename="{report.filename}"'}
    return StreamingResponse(
        report.stream,
        media_type=report.media_type,
        headers=headers,
    )


def process_record(record_id: int) -> None:
    with SessionLocal() as db:
        record = db.get(SurveyRecord, record_id)
        if not record:
            return
        record.status = "processing"
        db.commit()

    try:
        catalog = load_catalog()
        analyzer = build_analyzer()
        with SessionLocal() as db:
            record = db.get(SurveyRecord, record_id)
            if not record:
                return
            prepared = prepare_document_for_ai(
                Path(record.storage_path),
                record.mime_type,
                record.original_filename,
            )
            record.optimized_path = str(prepared.optimized_path)
            record.scanner_detected = prepared.scanner_detected
            db.commit()

        analysis = analyzer.analyze(
            prepared,
            AnalyzerContext(
                services=catalog["services"],
                departments=catalog["departments"],
            ),
        )
        _save_analysis(record_id, analysis)
    except Exception as exc:  # noqa: BLE001
        with SessionLocal() as db:
            record = db.get(SurveyRecord, record_id)
            if not record:
                return
            record.status = "failed"
            record.error_message = str(exc)
            record.processed_at = datetime.utcnow()
            db.commit()


def _save_analysis(record_id: int, analysis: SurveyAnalysis) -> None:
    with SessionLocal() as db:
        record = db.get(SurveyRecord, record_id)
        if not record:
            return

        record.department = analysis.department
        record.primary_category = analysis.survey_type
        record.sentiment = analysis.sentiment
        record.has_negative_comment = analysis.has_negative_comment
        record.overall_quality_level = analysis.overall_quality_level
        record.overall_quality_score = analysis.overall_quality_score
        record.executive_summary = analysis.executive_summary
        record.conclusion_text = "\n".join(analysis.conclusions)
        record.extracted_text = analysis.extracted_text
        record.ai_response_json = analysis_to_json(analysis)
        record.status = "completed"
        record.error_message = None
        record.processed_at = datetime.utcnow()

        record.services.clear()
        record.topics.clear()

        for service in analysis.services:
            record.services.append(
                ServiceObservation(
                    service_name=service.service_name,
                    quality_level=service.quality_level,
                    score=service.score,
                    mentioned=service.mentioned,
                    summary=service.summary,
                )
            )

        for kind, items in (
            ("suggestion", analysis.suggestions),
            ("complaint", analysis.complaints),
            ("negative_comment", analysis.negative_comments),
        ):
            for item in items:
                record.topics.append(
                    TopicObservation(
                        department=analysis.department,
                        kind=kind,
                        topic_text=item.text,
                        normalized_topic=_normalize_topic(item.text),
                        frequency_hint=item.frequency_hint,
                    )
                )

        db.commit()


def _normalize_topic(text: str) -> str:
    return " ".join(text.lower().strip().split())


def _register_scanned_file(path: Path, filename: str) -> int:
    data = path.read_bytes()
    record = SurveyRecord(
        original_filename=filename,
        stored_filename=filename,
        storage_path=str(path),
        mime_type="image/png",
        extension="png",
        file_size=len(data),
        sha256_hash=hashlib.sha256(data).hexdigest(),
        intake_mode="scanner",
        status="queued",
        scanner_detected=True,
    )
    with SessionLocal() as db:
        db.add(record)
        db.commit()
        db.refresh(record)
        return record.id


def _parse_analysis_payload(raw_json: str | None) -> dict[str, object]:
    if not raw_json:
        return {}
    try:
        return json.loads(raw_json)
    except json.JSONDecodeError:
        return {}


def _build_form_snapshot(record: SurveyRecord, services_catalog: list[str]) -> dict[str, object]:
    analysis = _parse_analysis_payload(record.ai_response_json)
    questionnaire = analysis.get("questionnaire", {})
    numbered = analysis.get("numbered_answers", {})
    contexts_source = " ".join(
        [
            " ".join(questionnaire.get("selected_contexts", [])) if isinstance(questionnaire, dict) else "",
            str(numbered.get("item_5") or ""),
        ]
    )
    roles_source = " ".join(
        [
            str(questionnaire.get("attendant_role") or "") if isinstance(questionnaire, dict) else "",
            str(numbered.get("item_12") or ""),
        ]
    )
    service_map = {service.service_name: service for service in record.services}

    return {
        "record": record,
        "questionnaire": questionnaire,
        "numbered": numbered,
        "contexts": {
            "hospedaje": _matches_option(contexts_source, "Huésped de los Hostales"),
            "restaurante": _matches_option(contexts_source, "Restaurante"),
            "evento": _matches_option(contexts_source, "Evento especial"),
            "club": _matches_option(contexts_source, "Visitas al Club Los Corozos"),
        },
        "roles": {
            "maletero": _matches_option(roles_source, "Maletero"),
            "eventos": _matches_option(roles_source, "Personal de eventos"),
            "cajero": _matches_option(roles_source, "Cajero"),
            "recepcionista": _matches_option(roles_source, "Recepcionista"),
            "camarera": _matches_option(roles_source, "Camarera"),
            "mesero": _matches_option(roles_source, "Mesero"),
            "masajista": _matches_option(roles_source, "Masajista"),
            "otro": _matches_option(roles_source, "Otro"),
        },
        "matrix_rows": [
            _build_service_matrix_row(service_name, service_map.get(service_name))
            for service_name in services_catalog
        ],
        "visitor_name": _coalesce(
            questionnaire.get("visitor_name") if isinstance(questionnaire, dict) else None,
            numbered.get("item_1") if isinstance(numbered, dict) else None,
        ),
        "affiliate": _coalesce(
            questionnaire.get("affiliate_text") if isinstance(questionnaire, dict) else None,
            numbered.get("item_2") if isinstance(numbered, dict) else None,
        ),
        "visit_date": _coalesce(
            questionnaire.get("visit_date") if isinstance(questionnaire, dict) else None,
            numbered.get("item_3") if isinstance(numbered, dict) else None,
        ),
        "contact_line": " | ".join(
            [
                value
                for value in [
                    questionnaire.get("email") if isinstance(questionnaire, dict) else None,
                    questionnaire.get("phone") if isinstance(questionnaire, dict) else None,
                ]
                if value
            ]
        ),
        "room_number": _coalesce(
            questionnaire.get("room_number") if isinstance(questionnaire, dict) else None,
            "",
        ),
    }


def _render_portal_page(
    request: Request,
    template_name: str,
    active_page: str,
    page_eyebrow: str,
    page_title: str,
    page_description: str,
) -> HTMLResponse:
    catalog = load_catalog()
    scanner_status = detect_scanner()
    with SessionLocal() as db:
        payload = build_dashboard_payload(db, catalog["services"])
    digital_forms = [
        _build_form_snapshot(record, catalog["services"])
        for record in payload["recent_records"]
    ]

    return templates.TemplateResponse(
        request=request,
        name=template_name,
        context={
            "app_name": settings.app_name,
            "catalog": catalog,
            "excel_templates": list_excel_templates(),
            "scanner_status": scanner_status,
            "payload": payload,
            "digital_forms": digital_forms,
            "active_page": active_page,
            "portal_nav": PORTAL_NAV,
            "page_eyebrow": page_eyebrow,
            "page_title": page_title,
            "page_description": page_description,
            "message": request.query_params.get("message"),
            "kind": request.query_params.get("kind", "info"),
        },
    )


def _build_service_matrix_row(service_name: str, service: ServiceObservation | None) -> dict[str, object]:
    quality_level = (service.quality_level.lower() if service and service.quality_level else "sin_dato")
    if quality_level in {"deficiente", "critico"}:
        quality_level = "malo"
    return {
        "name": service_name,
        "excelente": quality_level == "excelente",
        "bueno": quality_level == "bueno",
        "regular": quality_level == "regular",
        "malo": quality_level == "malo",
        "mentioned": bool(service and service.mentioned),
    }


def _matches_option(source: str, label: str) -> bool:
    return _normalize_text(label) in _normalize_text(source)


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = "".join(character if character.isalnum() or character.isspace() else " " for character in ascii_text.lower())
    return " ".join(cleaned.split())


def _coalesce(*values: object) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


if __name__ == "__main__":
    main()
