import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models import SurveyRecord

settings = get_settings()


def _bootstrap_normalize(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = "".join(character if character.isalnum() or character.isspace() else " " for character in ascii_text.lower())
    return " ".join(cleaned.split())

MONTHS_ES = {
    1: "Enero",
    2: "Febrero",
    3: "Marzo",
    4: "Abril",
    5: "Mayo",
    6: "Junio",
    7: "Julio",
    8: "Agosto",
    9: "Septiembre",
    10: "Octubre",
    11: "Noviembre",
    12: "Diciembre",
}
MONTH_INDEX_BY_NAME = {_bootstrap_normalize(name): index for index, name in MONTHS_ES.items()}
SERVICE_LEVELS = ("excelente", "bueno", "regular", "malo")
WORKBOOK_DEPARTMENT_ROWS = (
    "Cuartos",
    "A&B",
    "Seguridad",
    "Mantenimiento",
    "HACCP",
    "Eventos",
    "Corozos",
    "Informatica",
    "Administracion",
)
WORKBOOK_SERVICE_ALIASES = {
    "cortesia del personal": "CORTESIA DEL PERSONAL",
    "prontitud en chequeo de ingreso y salida": "PRONTITUD CHECK IN Y CHECK OUT",
    "prontitud en chequeo de ingreso salida": "PRONTITUD CHECK IN Y CHECK OUT",
    "limpieza de habitaciones": "LIMPIEZA DE HABITACIONES",
    "limpieza de sanitarios": "LIMPIEZA DE SANITARIOS",
    "mantenimiento de instalaciones": "MANTENIMIENTO DE INSTALACIONES",
    "jardines": "JARDINES",
    "servicio de maleteros": "SERVICIO DE MALETEROS",
    "calidad de comida": "CALIDAD DE COMIDA",
    "prontitud en revision de inventarios": "PRONTITUD DE INVENTARIOS",
    "servicio club los corozos": "SERVICIO LOS COROZOS",
    "servicio en tiendas de conveniencia": "SERVICIO EN TIENDAS DE CONVENIENCIA",
    "servicio en personal de eventos": "SERVICIO DE PERSONAL DE EVENTOS",
    "servicio de personal de eventos": "SERVICIO DE PERSONAL DE EVENTOS",
    "servicio en restaurante": "SERVICIO EN RESTAURANTES",
    "servicio en restaurantes": "SERVICIO EN RESTAURANTES",
    "personal de seguridad": "PERSONAL DE SEGURIDAD",
}
HOTEL_RELEVANT_SERVICES = {
    "CORTESIA DEL PERSONAL",
    "PRONTITUD CHECK IN Y CHECK OUT",
    "LIMPIEZA DE HABITACIONES",
    "LIMPIEZA DE SANITARIOS",
    "MANTENIMIENTO DE INSTALACIONES",
    "JARDINES",
    "SERVICIO DE MALETEROS",
    "PRONTITUD DE INVENTARIOS",
    "PERSONAL DE SEGURIDAD",
}
PEST_KEYWORDS = {
    "abejas": "Abejas",
    "zancudos": "Zancudos",
    "mosquitos": "Zancudos",
    "cucarachas": "Cucarachas",
    "chinches": "Chinches",
    "lagartija": "Lagartijas / Alacran",
    "lagartijas": "Lagartijas / Alacran",
    "alacran": "Lagartijas / Alacran",
    "alacranes": "Lagartijas / Alacran",
    "hormigas": "Hormigas",
    "moscas": "Moscas",
    "raton": "Raton",
    "ratones": "Raton",
}


@dataclass
class ExportArtifact:
    stream: BytesIO
    filename: str
    media_type: str


@dataclass
class RecordSnapshot:
    record: SurveyRecord
    analysis: dict[str, Any]
    questionnaire: dict[str, Any]
    numbered: dict[str, Any]
    blob: str
    year: int
    month: int


REQUIRED_TEMPLATE_SHEETS = {
    "Preguntas directas",
    "Nivel de Calidad",
    "Sugerencia o Queja",
    "Sujerencias por departamento",
    "Quejas por departamento",
}


def build_excel_report(
    db: Session,
    services_catalog: list[str],
    year: int | None = None,
) -> ExportArtifact:
    records = list(
        db.scalars(
            select(SurveyRecord)
            .options(
                selectinload(SurveyRecord.services),
                selectinload(SurveyRecord.topics),
            )
            .order_by(SurveyRecord.created_at.desc())
        )
    )
    report_year = year or _detect_report_year(records) or datetime.now().year
    template_path = _find_template_path(report_year)

    if not template_path:
        raise FileNotFoundError(
            "No se encontró la plantilla gerencial XLSM. "
            f"Coloca los archivos en {settings.excel_template_dir} con un nombre que incluya el año."
        )

    stream = _build_template_report(records, report_year, template_path)
    return ExportArtifact(
        stream=stream,
        filename=template_path.name,
        media_type="application/vnd.ms-excel.sheet.macroEnabled.12",
    )


def list_excel_templates() -> list[dict[str, Any]]:
    templates: list[dict[str, Any]] = []
    if not settings.excel_template_dir.exists():
        return templates

    for path in sorted(settings.excel_template_dir.glob("*.xlsm"), key=lambda item: item.name.lower()):
        templates.append(
            {
                "name": path.name,
                "year": _extract_year_from_name(path.name),
                "size_kb": round(path.stat().st_size / 1024, 1),
            }
        )
    return templates


def save_excel_template(filename: str, content: bytes) -> Path:
    safe_name = Path(filename).name
    if not safe_name.lower().endswith(".xlsm"):
        raise ValueError("Solo se permiten plantillas en formato XLSM.")

    target = settings.excel_template_dir / safe_name
    target.write_bytes(content)
    try:
        workbook = load_workbook(target, keep_vba=True, data_only=False)
    except Exception as exc:  # noqa: BLE001
        target.unlink(missing_ok=True)
        raise ValueError("La plantilla XLSM no se pudo abrir correctamente.") from exc

    missing_sheets = sorted(REQUIRED_TEMPLATE_SHEETS - set(workbook.sheetnames))
    if missing_sheets:
        target.unlink(missing_ok=True)
        missing = ", ".join(missing_sheets)
        raise ValueError(f"La plantilla no corresponde al formato gerencial esperado. Faltan hojas: {missing}.")

    return target

def _build_template_report(records: list[SurveyRecord], report_year: int, template_path: Path) -> BytesIO:
    workbook = load_workbook(template_path, keep_vba=True)
    snapshots = _build_snapshots(records, report_year)
    aggregate = _aggregate_report_data(snapshots)

    _fill_preguntas_directas(workbook["Preguntas directas"], aggregate)
    _fill_nivel_calidad(workbook["Nivel de Calidad"], aggregate)
    _fill_sugerencia_o_queja(workbook["Sugerencia o Queja"], aggregate)
    _fill_department_sheet(workbook["Sujerencias por departamento"], aggregate, kind="suggestion")
    _fill_department_sheet(workbook["Quejas por departamento"], aggregate, kind="complaint")
    _fill_suggestions_sheets(
        workbook["sugerencias mas Frecuentes"],
        workbook["OTRAS SUGERENCIAS"],
        aggregate,
    )
    _fill_complaints_top_sheet(workbook["QUEJAS MAS FRECUENTES"], aggregate)
    _fill_restaurant_negative_sheet(workbook["Comentarios Negativos en Rest"], aggregate)
    _fill_snack_negative_sheet(workbook["Coment Negativos snackBovedas"], aggregate)
    _fill_hotel_negative_sheet(workbook["Comentarios Negativos en Hotele"], aggregate)
    _fill_club_negative_sheet(workbook["Comentarios Negativos en Corozo"], aggregate)
    _fill_admin_negative_sheet(workbook["COMENTARIOS NEGATIVOS ADMON"], aggregate)
    _fill_restaurant_rating_sheet(workbook["Calificacion La Hacienda"], aggregate, "La Hacienda")
    _fill_restaurant_rating_sheet(workbook["Calificacion Las Arecas"], aggregate, "Las Arecas")
    _fill_restaurant_rating_sheet(workbook["Calificacion Kapa Hapa"], aggregate, "Kapa Hapa")
    _fill_restaurant_rating_sheet(workbook["Calificacion Rest. Corozos"], aggregate, "Restaurante Corozos")
    _fill_hotel_rating_sheet(workbook["Calificacion  San Martin"], aggregate, "San Martin")
    _fill_hotel_rating_sheet(workbook["Calificacion  Palajunoj"], aggregate, "Palajunoj")
    _fill_hotel_rating_sheet(workbook["Calificacion  Santa Cruz"], aggregate, "Santa Cruz")
    _fill_hotel_rating_sheet(workbook["Calificacion Rancheria"], aggregate, "Rancheria")
    _fill_club_rating_sheet(workbook["Calificacion Club Corozos"], aggregate)
    _fill_plagues_sheet(workbook["DISTRIBUCION DE PLAGAS"], aggregate)
    _set_workbook_recalculation(workbook)

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream


def _build_snapshots(records: list[SurveyRecord], report_year: int) -> list[RecordSnapshot]:
    snapshots: list[RecordSnapshot] = []
    for record in records:
        if record.status != "completed":
            continue
        analysis = _parse_analysis(record.ai_response_json)
        questionnaire = analysis.get("questionnaire", {})
        numbered = analysis.get("numbered_answers", {})
        report_date = _extract_record_date(record, questionnaire, numbered)
        if report_date.year != report_year:
            continue
        snapshots.append(
            RecordSnapshot(
                record=record,
                analysis=analysis,
                questionnaire=questionnaire,
                numbered=numbered,
                blob=_build_record_blob(record, analysis),
                year=report_date.year,
                month=report_date.month,
            )
        )
    return snapshots


def _aggregate_report_data(snapshots: list[RecordSnapshot]) -> dict[str, Any]:
    monthly = {month: _empty_month_data() for month in MONTHS_ES}
    topic_counts: dict[str, Counter[str]] = defaultdict(Counter)
    topic_display: dict[str, dict[str, str]] = defaultdict(dict)
    pest_counts: dict[str, Counter[str]] = defaultdict(Counter)

    for snapshot in snapshots:
        month_data = monthly[snapshot.month]
        questionnaire = snapshot.questionnaire

        _increment_tri_state(month_data["affiliate"], questionnaire.get("affiliate_status"), yes="afiliado", no="no_afiliado")
        _increment_contexts(month_data["reasons"], questionnaire.get("selected_contexts") or [])
        _increment_tri_state(month_data["recommend"], questionnaire.get("recommends_hostales"), yes="si", no="no")
        _increment_tri_state(month_data["resolved"], questionnaire.get("issue_resolved_in_time"), yes="si", no="no")
        _increment_tri_state(month_data["collaborator"], questionnaire.get("collaborator_caused_issue"), yes="si", no="no")

        attendant_text = " ".join(
            value for value in [
                str(questionnaire.get("attendant_role") or ""),
                str(snapshot.numbered.get("item_12") or ""),
            ] if value
        )
        roles = _extract_attendant_roles(attendant_text)
        for role in roles:
            month_data["attendant"][role] += 1

        if snapshot.record.primary_category in {"sugerencia", "mixto"}:
            month_data["categories"]["sugerencia"] += 1
            month_data["departments"]["suggestion"][_infer_department_bucket(snapshot)] += 1
        if snapshot.record.primary_category in {"queja", "mixto"}:
            month_data["categories"]["queja"] += 1
            month_data["departments"]["complaint"][_infer_department_bucket(snapshot)] += 1

        restaurant_venue = _infer_restaurant_venue(snapshot.blob)
        hotel_venue = _infer_hotel_venue(snapshot.blob)

        for service in snapshot.record.services:
            if not service.mentioned:
                continue
            workbook_key = _service_template_key(service.service_name)
            quality = _quality_level_for_template(service.quality_level)
            if not workbook_key or not quality:
                continue
            month_data["services"][workbook_key][quality] += 1

            if restaurant_venue == "La Hacienda" and workbook_key == "CALIDAD DE COMIDA":
                month_data["restaurant_ratings"]["La Hacienda"]["food"][quality] += 1
            elif restaurant_venue == "Las Arecas" and workbook_key == "CALIDAD DE COMIDA":
                month_data["restaurant_ratings"]["Las Arecas"]["food"][quality] += 1
            elif restaurant_venue == "Kapa Hapa" and workbook_key == "CALIDAD DE COMIDA":
                month_data["restaurant_ratings"]["Kapa Hapa"]["food"][quality] += 1
            elif restaurant_venue == "Restaurante Corozos" and workbook_key == "CALIDAD DE COMIDA":
                month_data["restaurant_ratings"]["Restaurante Corozos"]["food"][quality] += 1

            if restaurant_venue == "La Hacienda" and workbook_key == "SERVICIO EN RESTAURANTES":
                month_data["restaurant_ratings"]["La Hacienda"]["service"][quality] += 1
            elif restaurant_venue == "Las Arecas" and workbook_key == "SERVICIO EN RESTAURANTES":
                month_data["restaurant_ratings"]["Las Arecas"]["service"][quality] += 1
            elif restaurant_venue == "Kapa Hapa" and workbook_key == "SERVICIO EN RESTAURANTES":
                month_data["restaurant_ratings"]["Kapa Hapa"]["service"][quality] += 1
            elif restaurant_venue == "Restaurante Corozos" and workbook_key == "SERVICIO EN RESTAURANTES":
                month_data["restaurant_ratings"]["Restaurante Corozos"]["service"][quality] += 1

            if hotel_venue and workbook_key in HOTEL_RELEVANT_SERVICES:
                month_data["hotel_ratings"][hotel_venue]["quality"][quality] += 1

            if workbook_key == "SERVICIO LOS COROZOS":
                month_data["club_rating"]["quality"][quality] += 1

        for topic in snapshot.record.topics:
            bucket = "suggestions" if topic.kind == "suggestion" else "complaints"
            _add_topic(topic_counts, topic_display, bucket, topic.topic_text)

            topic_blob = _normalize_text(f"{snapshot.blob} {topic.topic_text}")
            if bucket == "suggestions":
                continue

            if restaurant_area := _infer_restaurant_venue(topic_blob):
                _add_topic(topic_counts, topic_display, f"restaurant:{restaurant_area}", topic.topic_text)
                month_data["restaurant_ratings"][restaurant_area]["negative"] += 1
                _register_pest(pest_counts, area_key=f"restaurant:{restaurant_area}", topic_blob=topic_blob)
                continue

            if snack_area := _infer_snack_area(topic_blob):
                _add_topic(topic_counts, topic_display, f"snack:{snack_area}", topic.topic_text)
                continue

            if club_area := _infer_club_area(topic_blob):
                _add_topic(topic_counts, topic_display, f"club:{club_area}", topic.topic_text)
                month_data["club_rating"]["negative"] += 1
                continue

            if _looks_like_reception_issue(topic_blob):
                _add_topic(topic_counts, topic_display, "hotel:Recepcion y Reservaciones", topic.topic_text)
                continue

            if hotel_area := _infer_hotel_venue(topic_blob):
                _add_topic(topic_counts, topic_display, f"hotel:{hotel_area}", topic.topic_text)
                month_data["hotel_ratings"][hotel_area]["negative"] += 1
                _register_pest(pest_counts, area_key=f"hotel:{hotel_area}", topic_blob=topic_blob)
                continue

            if admin_area := _infer_admin_area(topic_blob):
                _add_topic(topic_counts, topic_display, f"admin:{admin_area}", topic.topic_text)
                continue

            department_bucket = _infer_department_bucket(snapshot)
            if department_bucket == "A&B":
                _add_topic(topic_counts, topic_display, "complaints_restaurant_generic", topic.topic_text)
            elif department_bucket == "Cuartos":
                _add_topic(topic_counts, topic_display, "complaints_hotel_generic", topic.topic_text)
            elif department_bucket == "Corozos":
                _add_topic(topic_counts, topic_display, "complaints_club_generic", topic.topic_text)
            elif department_bucket in {"Administracion", "Informatica", "Seguridad"}:
                _add_topic(topic_counts, topic_display, f"admin:{department_bucket}", topic.topic_text)

    return {
        "monthly": monthly,
        "topic_counts": topic_counts,
        "topic_display": topic_display,
        "pest_counts": pest_counts,
    }


def _fill_preguntas_directas(worksheet, aggregate: dict[str, Any]) -> None:
    month_rows = _find_month_rows(worksheet)
    for month, row in month_rows.items():
        month_data = aggregate["monthly"][month]
        _write_value(worksheet, f"B{row}", month_data["affiliate"].get("afiliado", 0))
        _write_value(worksheet, f"C{row}", month_data["affiliate"].get("no_afiliado", 0))
        _write_value(worksheet, f"D{row}", month_data["affiliate"].get("no_indica", 0))

        _write_value(worksheet, f"H{row}", month_data["reasons"].get("huesped", 0))
        _write_value(worksheet, f"I{row}", month_data["reasons"].get("restaurante", 0))
        _write_value(worksheet, f"J{row}", month_data["reasons"].get("evento", 0))
        _write_value(worksheet, f"K{row}", month_data["reasons"].get("club", 0))
        _write_value(worksheet, f"L{row}", month_data["reasons"].get("no_indica", 0))

        _write_value(worksheet, f"O{row}", month_data["recommend"].get("si", 0))
        _write_value(worksheet, f"P{row}", month_data["recommend"].get("no", 0))
        _write_value(worksheet, f"Q{row}", month_data["recommend"].get("no_indica", 0))

        _write_value(worksheet, f"T{row}", month_data["resolved"].get("si", 0))
        _write_value(worksheet, f"U{row}", month_data["resolved"].get("no", 0))
        _write_value(worksheet, f"V{row}", month_data["resolved"].get("no_indica", 0))

        _write_value(worksheet, f"Y{row}", month_data["collaborator"].get("si", 0))
        _write_value(worksheet, f"Z{row}", month_data["collaborator"].get("no", 0))
        _write_value(worksheet, f"AA{row}", month_data["collaborator"].get("no_indica", 0))

        _write_value(worksheet, f"AD{row}", month_data["attendant"].get("maletero", 0))
        _write_value(worksheet, f"AE{row}", month_data["attendant"].get("eventos", 0))
        _write_value(worksheet, f"AF{row}", month_data["attendant"].get("cajero", 0))
        _write_value(worksheet, f"AG{row}", month_data["attendant"].get("recepcion", 0))
        _write_value(worksheet, f"AH{row}", month_data["attendant"].get("camarera", 0))
        _write_value(worksheet, f"AI{row}", month_data["attendant"].get("mesero", 0))
        _write_value(worksheet, f"AJ{row}", month_data["attendant"].get("masajista", 0))
        _write_value(worksheet, f"AK{row}", month_data["attendant"].get("otro", 0))


def _fill_nivel_calidad(worksheet, aggregate: dict[str, Any]) -> None:
    month_rows = _find_month_rows(worksheet)
    start_columns = {
        "CORTESIA DEL PERSONAL": "B",
        "PRONTITUD CHECK IN Y CHECK OUT": "H",
        "LIMPIEZA DE HABITACIONES": "N",
        "LIMPIEZA DE SANITARIOS": "T",
        "MANTENIMIENTO DE INSTALACIONES": "Z",
        "JARDINES": "AF",
        "SERVICIO DE MALETEROS": "AL",
        "CALIDAD DE COMIDA": "AR",
        "PRONTITUD DE INVENTARIOS": "AX",
        "SERVICIO LOS COROZOS": "BD",
        "SERVICIO EN TIENDAS DE CONVENIENCIA": "BJ",
        "SERVICIO DE PERSONAL DE EVENTOS": "BP",
        "SERVICIO EN RESTAURANTES": "BV",
        "PERSONAL DE SEGURIDAD": "CB",
    }
    offsets = {"excelente": 0, "bueno": 1, "regular": 2, "malo": 3}
    for month, row in month_rows.items():
        services = aggregate["monthly"][month]["services"]
        for service_key, start_column in start_columns.items():
            base_index = column_index_from_string(start_column)
            for quality, offset in offsets.items():
                count = services[service_key].get(quality, 0)
                worksheet.cell(row=row, column=base_index + offset).value = count


def _fill_sugerencia_o_queja(worksheet, aggregate: dict[str, Any]) -> None:
    month_rows = _find_month_rows(worksheet)
    for month, row in month_rows.items():
        month_data = aggregate["monthly"][month]["categories"]
        _write_value(worksheet, f"C{row}", month_data.get("sugerencia", 0))
        _write_value(worksheet, f"D{row}", month_data.get("queja", 0))


def _fill_department_sheet(worksheet, aggregate: dict[str, Any], kind: str) -> None:
    month_columns = {month: column_index_from_string(column) for month, column in zip(MONTHS_ES, "CDEFGHIJKLMN")}
    row_by_department = _find_label_rows(worksheet, WORKBOOK_DEPARTMENT_ROWS)
    for department in WORKBOOK_DEPARTMENT_ROWS:
        row = row_by_department.get(_normalize_text(department))
        if not row:
            continue
        for month, column in month_columns.items():
            key = "suggestion" if kind == "suggestion" else "complaint"
            count = aggregate["monthly"][month]["departments"][key].get(department, 0)
            worksheet.cell(row=row, column=column).value = count


def _fill_suggestions_sheets(frequent_sheet, other_sheet, aggregate: dict[str, Any]) -> None:
    frequent_items = _top_items(aggregate, "suggestions", 17)
    other_items = _top_items(aggregate, "suggestions", 200)[17:]
    _write_topic_series(frequent_sheet, label_column="B", count_column="C", rows=range(6, 23), items=frequent_items)
    _write_topic_grid(other_sheet, column_pairs=[("A", "B"), ("D", "E"), ("G", "H"), ("J", "K"), ("M", "N"), ("P", "Q")], start_row=3, end_row=other_sheet.max_row, items=other_items)


def _fill_complaints_top_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    items = _top_items(aggregate, "complaints", 9)
    _write_topic_series(worksheet, label_column="B", count_column="C", rows=range(5, 14), items=items)


def _fill_restaurant_negative_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    _write_topic_series(worksheet, "B", "C", range(3, 15), _top_items(aggregate, "restaurant:La Hacienda", 12))
    _write_topic_series(worksheet, "F", "G", range(3, 15), _top_items(aggregate, "restaurant:Las Arecas", 12))
    _write_topic_series(worksheet, "J", "K", range(3, 15), _top_items(aggregate, "restaurant:Kapa Hapa", 12))
    _write_topic_series(worksheet, "N", "O", range(3, 15), _top_items(aggregate, "restaurant:Restaurante Corozos", 12))
    _write_topic_labels(worksheet, "R", range(3, 15), _top_items(aggregate, "complaints_restaurant_total", 12, source_groups=[
        "restaurant:La Hacienda",
        "restaurant:Las Arecas",
        "restaurant:Kapa Hapa",
        "restaurant:Restaurante Corozos",
        "complaints_restaurant_generic",
    ]))


def _fill_snack_negative_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    _write_topic_series(worksheet, "A", "B", range(6, 10), _top_items(aggregate, "snack:Rickilandia", 4))
    _write_topic_series(worksheet, "E", "F", range(6, 10), _top_items(aggregate, "snack:Oasis Moana", 4))
    _write_topic_series(worksheet, "I", "J", range(6, 10), _top_items(aggregate, "snack:Snack Boliche", 4))
    _write_topic_series(worksheet, "A", "B", range(13, 19), _top_items(aggregate, "snack:Bar Bovedas", 6))
    _write_topic_series(worksheet, "E", "F", range(13, 17), _top_items(aggregate, "snack:Plaza Hormigos", 4))


def _fill_hotel_negative_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    _write_topic_series(worksheet, "A", "B", range(4, 31), _top_items(aggregate, "hotel:San Martin", 27))
    _write_topic_series(worksheet, "E", "F", range(4, 33), _top_items(aggregate, "hotel:Palajunoj", 29))
    _write_topic_series(worksheet, "I", "J", range(4, 31), _top_items(aggregate, "hotel:Santa Cruz", 27))
    _write_topic_series(worksheet, "M", "N", range(4, 35), _top_items(aggregate, "hotel:Rancheria", 31))
    _write_topic_labels(
        worksheet,
        "Q",
        range(4, 35),
        _top_items(
            aggregate,
            "complaints_hotel_total",
            31,
            source_groups=[
                "hotel:San Martin",
                "hotel:Palajunoj",
                "hotel:Santa Cruz",
                "hotel:Rancheria",
                "complaints_hotel_generic",
            ],
        ),
    )
    _write_topic_series(worksheet, "V", "W", range(4, 14), _top_items(aggregate, "hotel:Recepcion y Reservaciones", 10))


def _fill_club_negative_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    _write_topic_series(worksheet, "B", "C", range(5, 14), _top_items(aggregate, "club:SPA", 9))
    _write_topic_series(worksheet, "G", "H", range(5, 11), _top_items(aggregate, "club:Golfito", 6))
    _write_topic_series(worksheet, "L", "M", range(5, 9), _top_items(aggregate, "club:Boliche", 4))
    _write_topic_series(worksheet, "P", "Q", range(5, 10), _top_items(aggregate, "club:Salon de Belleza / Spa Luna", 5))


def _fill_admin_negative_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    _write_topic_series(worksheet, "A", "B", range(4, 8), _top_items(aggregate, "admin:Souvenir", 4))
    _write_topic_series(worksheet, "E", "F", range(4, 8), _top_items(aggregate, "admin:Clinica Primeros Auxilios", 4))
    _write_topic_series(worksheet, "I", "J", range(4, 15), _top_items(aggregate, "admin:Piscinas", 11))
    _write_topic_series(worksheet, "M", "N", range(4, 9), _top_items(aggregate, "admin:Departamento de Caja", 5))
    _write_topic_series(worksheet, "A", "B", range(23, 27), _top_items(aggregate, "admin:Circuito Cerrado", 4))
    _write_topic_series(worksheet, "E", "F", range(23, 27), _top_items(aggregate, "admin:Departamento de Seguridad", 4))


def _fill_restaurant_rating_sheet(worksheet, aggregate: dict[str, Any], venue: str) -> None:
    month_rows = _find_month_rows(worksheet)
    for month, row in month_rows.items():
        ratings = aggregate["monthly"][month]["restaurant_ratings"][venue]
        _write_value(worksheet, f"F{row}", ratings["negative"])
        _write_value(worksheet, f"I{row}", ratings["food"].get("excelente", 0) + ratings["food"].get("bueno", 0))
        _write_value(worksheet, f"J{row}", ratings["food"].get("regular", 0))
        _write_value(worksheet, f"K{row}", ratings["food"].get("malo", 0))
        _write_value(worksheet, f"N{row}", ratings["service"].get("excelente", 0) + ratings["service"].get("bueno", 0))
        _write_value(worksheet, f"O{row}", ratings["service"].get("regular", 0))
        _write_value(worksheet, f"P{row}", ratings["service"].get("malo", 0))


def _fill_hotel_rating_sheet(worksheet, aggregate: dict[str, Any], venue: str) -> None:
    month_rows = _find_month_rows(worksheet)
    for month, row in month_rows.items():
        ratings = aggregate["monthly"][month]["hotel_ratings"][venue]
        _write_value(worksheet, f"C{row}", ratings["quality"].get("excelente", 0) + ratings["quality"].get("bueno", 0))
        _write_value(worksheet, f"D{row}", ratings["quality"].get("regular", 0))
        _write_value(worksheet, f"E{row}", ratings["quality"].get("malo", 0))
        _write_value(worksheet, f"F{row}", ratings["negative"])


def _fill_club_rating_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    month_rows = _find_month_rows(worksheet)
    for month, row in month_rows.items():
        ratings = aggregate["monthly"][month]["club_rating"]
        _write_value(worksheet, f"C{row}", ratings["quality"].get("excelente", 0) + ratings["quality"].get("bueno", 0))
        _write_value(worksheet, f"D{row}", ratings["quality"].get("regular", 0))
        _write_value(worksheet, f"E{row}", ratings["quality"].get("malo", 0))
        _write_value(worksheet, f"F{row}", ratings["negative"])


def _fill_plagues_sheet(worksheet, aggregate: dict[str, Any]) -> None:
    _clear_columns(worksheet, columns=["C", "G", "K", "O"], rows=range(3, 10))
    _clear_columns(worksheet, columns=["C", "G", "K", "O"], rows=range(13, 20))

    hotel_sections = {
        "hotel:Palajunoj": "C",
        "hotel:San Martin": "G",
        "hotel:Santa Cruz": "K",
        "hotel:Rancheria": "O",
    }
    hotel_rows = {
        "Abejas": 3,
        "Zancudos": 4,
        "Cucarachas": 5,
        "Chinches": 6,
        "Lagartijas / Alacran": 7,
        "Hormigas": 8,
        "Moscas": 9,
    }
    for area_key, count_column in hotel_sections.items():
        for pest_name, count in aggregate["pest_counts"].get(area_key, Counter()).items():
            row = hotel_rows.get(pest_name)
            if row:
                worksheet[f"{count_column}{row}"] = count


def _find_template_path(report_year: int) -> Path | None:
    search_roots = [settings.excel_template_dir]
    candidates: list[Path] = []
    for root in search_roots:
        if not root.exists():
            continue
        for path in root.iterdir():
            if not path.is_file():
                continue
            lower_name = path.name.lower()
            if lower_name.endswith(".xlsm") and "informe gerencial encuestas" in lower_name:
                candidates.append(path)
    if not candidates:
        return None

    direct_match = [path for path in candidates if str(report_year) in path.name]
    if direct_match:
        return sorted(direct_match, key=lambda item: item.stat().st_mtime, reverse=True)[0]
    return sorted(candidates, key=lambda item: item.stat().st_mtime, reverse=True)[0]


def _extract_year_from_name(filename: str) -> int | None:
    match = re.search(r"(20\d{2})", filename)
    if not match:
        return None
    return int(match.group(1))


def _detect_report_year(records: list[SurveyRecord]) -> int | None:
    years: Counter[int] = Counter()
    for record in records:
        analysis = _parse_analysis(record.ai_response_json)
        questionnaire = analysis.get("questionnaire", {})
        numbered = analysis.get("numbered_answers", {})
        report_date = _extract_record_date(record, questionnaire, numbered)
        years[report_date.year] += 1
    if not years:
        return None
    return years.most_common(1)[0][0]


def _empty_month_data() -> dict[str, Any]:
    return {
        "affiliate": Counter(),
        "reasons": Counter(),
        "recommend": Counter(),
        "resolved": Counter(),
        "collaborator": Counter(),
        "attendant": Counter(),
        "categories": Counter(),
        "departments": {"suggestion": Counter(), "complaint": Counter()},
        "services": {service_key: Counter({level: 0 for level in SERVICE_LEVELS}) for service_key in WORKBOOK_SERVICE_ALIASES.values()},
        "restaurant_ratings": {
            venue: {"food": Counter(), "service": Counter(), "negative": 0}
            for venue in ("La Hacienda", "Las Arecas", "Kapa Hapa", "Restaurante Corozos")
        },
        "hotel_ratings": {
            venue: {"quality": Counter(), "negative": 0}
            for venue in ("San Martin", "Palajunoj", "Santa Cruz", "Rancheria")
        },
        "club_rating": {"quality": Counter(), "negative": 0},
    }


def _build_record_blob(record: SurveyRecord, analysis: dict[str, Any]) -> str:
    questionnaire = analysis.get("questionnaire", {})
    numbered = analysis.get("numbered_answers", {})
    chunks = [
        record.department or "",
        record.executive_summary or "",
        record.extracted_text or "",
        questionnaire.get("visit_reason") or "",
        questionnaire.get("attendant_role") or "",
        questionnaire.get("attendant_name") or "",
        questionnaire.get("improvement_comment") or "",
        " ".join(questionnaire.get("selected_contexts", []) or []),
        " ".join(str(value or "") for value in numbered.values()) if isinstance(numbered, dict) else "",
    ]
    for topic in analysis.get("suggestions", []):
        chunks.append(topic.get("text") if isinstance(topic, dict) else "")
    for topic in analysis.get("complaints", []):
        chunks.append(topic.get("text") if isinstance(topic, dict) else "")
    for topic in analysis.get("negative_comments", []):
        chunks.append(topic.get("text") if isinstance(topic, dict) else "")
    return _normalize_text(" ".join(chunk for chunk in chunks if chunk))


def _extract_record_date(record: SurveyRecord, questionnaire: dict[str, Any], numbered: dict[str, Any]) -> date:
    raw_date = (
        questionnaire.get("visit_date")
        or numbered.get("item_3")
        or record.processed_at
        or record.created_at
    )
    if isinstance(raw_date, datetime):
        return raw_date.date()
    if isinstance(raw_date, date):
        return raw_date
    parsed = _parse_flexible_date(str(raw_date or ""))
    return parsed or record.created_at.date()


def _parse_flexible_date(raw_value: str) -> date | None:
    text = raw_value.strip()
    if not text:
        return None

    cleaned = text.replace(".", "/").replace("-", "/")
    match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", cleaned)
    if not match:
        return None

    day = int(match.group(1))
    month = int(match.group(2))
    year = int(match.group(3))
    if year < 100:
        year += 2000 if year < 70 else 1900
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _increment_tri_state(counter: Counter[str], value: Any, yes: str, no: str) -> None:
    normalized = _normalize_text(str(value or ""))
    if normalized == "si":
        counter[yes] += 1
    elif normalized == "no":
        counter[no] += 1
    else:
        counter["no_indica"] += 1


def _increment_contexts(counter: Counter[str], contexts: list[str]) -> None:
    if not contexts:
        counter["no_indica"] += 1
        return

    any_match = False
    for context in contexts:
        normalized = _normalize_text(context)
        if "huesped" in normalized or "hostales" in normalized:
            counter["huesped"] += 1
            any_match = True
        elif "restaurante" in normalized:
            counter["restaurante"] += 1
            any_match = True
        elif "evento" in normalized:
            counter["evento"] += 1
            any_match = True
        elif "corozo" in normalized or "club" in normalized:
            counter["club"] += 1
            any_match = True
    if not any_match:
        counter["no_indica"] += 1


def _extract_attendant_roles(text: str) -> set[str]:
    normalized = _normalize_text(text)
    roles = set()
    if "maletero" in normalized:
        roles.add("maletero")
    if "evento" in normalized:
        roles.add("eventos")
    if "cajero" in normalized:
        roles.add("cajero")
    if "recepcion" in normalized or "recepcionista" in normalized:
        roles.add("recepcion")
    if "camarera" in normalized:
        roles.add("camarera")
    if "mesero" in normalized:
        roles.add("mesero")
    if "masajista" in normalized:
        roles.add("masajista")
    if "otro" in normalized:
        roles.add("otro")
    return roles


def _infer_department_bucket(snapshot: RecordSnapshot) -> str:
    source = f"{_normalize_text(snapshot.record.department)} {snapshot.blob}"
    exact_map = {
        "habitaciones": "Cuartos",
        "los hostales": "Cuartos",
        "recepcion": "Cuartos",
        "recepcionista": "Cuartos",
        "restaurante": "A&B",
        "club los corozos": "Corozos",
        "corozos": "Corozos",
        "eventos": "Eventos",
        "seguridad": "Seguridad",
        "mantenimiento": "Mantenimiento",
        "administracion": "Administracion",
        "informatica": "Informatica",
        "a b": "A&B",
    }
    for key, bucket in exact_map.items():
        if key in source:
            return bucket

    if _contains_any(source, ["wifi", "internet", "app", "reserva en linea", "canal", "tv", "usb", "sistema"]):
        return "Informatica"
    if _contains_any(source, ["souvenir", "clinica", "piscina", "caja", "cajera", "cobro pos", "rickilandia", "oasis moana", "snack boliche", "bar bovedas", "plaza hormigos"]):
        return "Administracion"
    if _contains_any(source, ["spa", "golfito", "boliche", "pedicure", "manicure", "cultora", "masajista", "club corozos"]):
        return "Corozos"
    if _contains_any(source, ["mesero", "comida", "desayuno", "menu", "hacienda", "arecas", "kapa hapa", "restaurante corozos"]):
        return "A&B"
    if _contains_any(source, ["mantenimiento", "ducha", "lavamanos", "electrodomesticos", "puerta", "ac", "aire acondicionado"]):
        return "Mantenimiento"
    if _contains_any(source, ["salvavidas", "seguridad", "guardia"]):
        return "Seguridad"
    if "evento" in source:
        return "Eventos"
    return "Cuartos"


def _infer_restaurant_venue(source: str) -> str | None:
    normalized = _normalize_text(source)
    if "hacienda" in normalized:
        return "La Hacienda"
    if "arecas" in normalized:
        return "Las Arecas"
    if "kapa hapa" in normalized:
        return "Kapa Hapa"
    if "restaurante corozos" in normalized or ("corozos" in normalized and "restaurante" in normalized):
        return "Restaurante Corozos"
    return None


def _infer_hotel_venue(source: str) -> str | None:
    normalized = _normalize_text(source)
    if "san martin" in normalized:
        return "San Martin"
    if "palajunoj" in normalized:
        return "Palajunoj"
    if "santa cruz" in normalized:
        return "Santa Cruz"
    if "rancheria" in normalized:
        return "Rancheria"
    return None


def _infer_club_area(source: str) -> str | None:
    normalized = _normalize_text(source)
    if _contains_any(normalized, ["spa luna", "gelish", "pedicure", "manicure", "salon de belleza", "cultora"]):
        return "Salon de Belleza / Spa Luna"
    if _contains_any(normalized, ["spa", "masaje", "masajista", "jacuzzi"]):
        return "SPA"
    if _contains_any(normalized, ["golfito", "canchas", "juego media hora"]):
        return "Golfito"
    if _contains_any(normalized, ["boliche", "pistas", "cajero"]):
        return "Boliche"
    return None


def _infer_admin_area(source: str) -> str | None:
    normalized = _normalize_text(source)
    if "souvenir" in normalized:
        return "Souvenir"
    if _contains_any(normalized, ["clinica", "enfermero", "medico"]):
        return "Clinica Primeros Auxilios"
    if _contains_any(normalized, ["piscina", "salvavidas", "jacuzzi rancheria"]):
        return "Piscinas"
    if _contains_any(normalized, ["caja", "cajera", "cobro pos"]):
        return "Departamento de Caja"
    if _contains_any(normalized, ["circuito cerrado", "canal", "programacion tv"]):
        return "Circuito Cerrado"
    if _contains_any(normalized, ["seguridad ingreso", "boleta", "datos incorrectos en boleta"]):
        return "Departamento de Seguridad"
    if "informatica" in normalized:
        return "Administracion"
    return None


def _infer_snack_area(source: str) -> str | None:
    normalized = _normalize_text(source)
    if "rickilandia" in normalized:
        return "Rickilandia"
    if "oasis moana" in normalized or "oasis" in normalized:
        return "Oasis Moana"
    if "snack boliche" in normalized:
        return "Snack Boliche"
    if "bar bovedas" in normalized or "bovedas" in normalized:
        return "Bar Bovedas"
    if "plaza hormigos" in normalized:
        return "Plaza Hormigos"
    return None


def _looks_like_reception_issue(source: str) -> bool:
    normalized = _normalize_text(source)
    return _contains_any(
        normalized,
        [
            "recepcion",
            "reservacion",
            "reservaciones",
            "reserva por correo",
            "reservas en linea",
            "ubicacion de acuerdo a la reserva",
            "no poder reservar",
            "misma hab a 2",
        ],
    )


def _register_pest(pest_counts: dict[str, Counter[str]], area_key: str, topic_blob: str) -> None:
    for keyword, pest_name in PEST_KEYWORDS.items():
        if keyword in topic_blob:
            pest_counts[area_key][pest_name] += 1


def _service_template_key(service_name: str) -> str | None:
    return WORKBOOK_SERVICE_ALIASES.get(_normalize_text(service_name))


def _quality_level_for_template(value: str | None) -> str | None:
    normalized = _normalize_text(value or "")
    if normalized in {"excelente", "bueno", "regular", "malo"}:
        return normalized
    if normalized in {"deficiente", "critico"}:
        return "malo"
    return None


def _add_topic(
    topic_counts: dict[str, Counter[str]],
    topic_display: dict[str, dict[str, str]],
    bucket: str,
    text: str | None,
) -> None:
    normalized = _normalize_topic(text)
    if not normalized:
        return
    topic_counts[bucket][normalized] += 1
    topic_display[bucket].setdefault(normalized, (text or "").strip())


def _top_items(
    aggregate: dict[str, Any],
    bucket: str,
    limit: int,
    source_groups: list[str] | None = None,
) -> list[tuple[str, int]]:
    if source_groups:
        merged = Counter()
        display: dict[str, str] = {}
        for group in source_groups:
            for key, count in aggregate["topic_counts"].get(group, Counter()).items():
                merged[key] += count
                display.setdefault(key, aggregate["topic_display"].get(group, {}).get(key, key))
        return [(display.get(key, key), count) for key, count in merged.most_common(limit)]

    counter = aggregate["topic_counts"].get(bucket, Counter())
    display = aggregate["topic_display"].get(bucket, {})
    return [(display.get(key, key), count) for key, count in counter.most_common(limit)]


def _write_topic_series(
    worksheet,
    label_column: str,
    count_column: str,
    rows: range,
    items: list[tuple[str, int]],
) -> None:
    pairs = list(items)
    for index, row in enumerate(rows):
        label = pairs[index][0] if index < len(pairs) else None
        count = pairs[index][1] if index < len(pairs) else None
        worksheet[f"{label_column}{row}"] = label
        worksheet[f"{count_column}{row}"] = count


def _write_topic_labels(
    worksheet,
    label_column: str,
    rows: range,
    items: list[tuple[str, int]],
) -> None:
    pairs = list(items)
    for index, row in enumerate(rows):
        label = pairs[index][0] if index < len(pairs) else None
        worksheet[f"{label_column}{row}"] = label


def _write_topic_grid(
    worksheet,
    column_pairs: list[tuple[str, str]],
    start_row: int,
    end_row: int,
    items: list[tuple[str, int]],
) -> None:
    slots = []
    for label_column, count_column in column_pairs:
        for row in range(start_row, end_row + 1):
            slots.append((label_column, count_column, row))

    for index, (label_column, count_column, row) in enumerate(slots):
        if index < len(items):
            worksheet[f"{label_column}{row}"] = items[index][0]
            worksheet[f"{count_column}{row}"] = items[index][1]
        else:
            worksheet[f"{label_column}{row}"] = None
            worksheet[f"{count_column}{row}"] = None


def _find_month_rows(worksheet) -> dict[int, int]:
    rows: dict[int, int] = {}
    for row in worksheet.iter_rows():
        for cell in row:
            normalized = _normalize_month(cell.value)
            if normalized in MONTH_INDEX_BY_NAME:
                rows.setdefault(MONTH_INDEX_BY_NAME[normalized], cell.row)
    return rows


def _find_label_rows(worksheet, labels: tuple[str, ...] | list[str]) -> dict[str, int]:
    wanted = {_normalize_text(label) for label in labels}
    found: dict[str, int] = {}
    for row in worksheet.iter_rows():
        for cell in row:
            normalized = _normalize_text(cell.value)
            if normalized in wanted:
                found.setdefault(normalized, cell.row)
    return found


def _write_value(worksheet, address: str, value: Any) -> None:
    worksheet[address] = value if value not in ("", None) else 0


def _clear_columns(worksheet, columns: list[str], rows: range) -> None:
    for column in columns:
        for row in rows:
            worksheet[f"{column}{row}"] = None


def _set_workbook_recalculation(workbook) -> None:
    workbook.calculation.calcMode = "auto"
    workbook.calculation.fullCalcOnLoad = True
    workbook.calculation.forceFullCalc = True
def _parse_analysis(raw_json: str | None) -> dict[str, Any]:
    if not raw_json:
        return {}
    try:
        return json.loads(raw_json)
    except json.JSONDecodeError:
        return {}


def _normalize_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = "".join(character if character.isalnum() or character.isspace() else " " for character in ascii_text.lower())
    return " ".join(cleaned.split())


def _normalize_month(value: Any) -> str:
    return _normalize_text(value)


def _normalize_topic(value: str | None) -> str:
    return _normalize_text(value or "")


def _contains_any(source: str, keywords: list[str]) -> bool:
    return any(_normalize_text(keyword) in source for keyword in keywords)
