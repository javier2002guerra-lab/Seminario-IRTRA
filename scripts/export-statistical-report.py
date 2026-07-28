import json
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

HEADER_FILL = PatternFill("solid", fgColor="087D70")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def safe(value):
    if value is None:
        return ""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def add_sheet(book, title, columns, rows):
    sheet = book.create_sheet(title)
    sheet.append([header for header, _, _ in columns])
    for cell in sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    for row in rows:
        sheet.append([safe(row.get(key)) for _, key, _ in columns])
    for index, (_, _, width) in enumerate(columns, 1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    return sheet


def main(input_path, output_path):
    data = json.loads(Path(input_path).read_text(encoding="utf-8"))
    book = Workbook()
    book.remove(book.active)
    summary = data["summary"]
    range_ = data["range"]
    summary_rows = [
        {"label": "Encuestas", "value": summary["total"], "definition": "Registros sin estado Error dentro del rango."},
        {"label": "Felicitaciones", "value": summary["compliments"], "definition": "Categoría Felicitación."},
        {"label": "Quejas", "value": summary["complaints"], "definition": "Categoría Queja o Mixta."},
        {"label": "Sugerencias", "value": summary["suggestions"], "definition": "Categoría Sugerencia o Mixta."},
        {"label": "Pendientes de revisión", "value": summary["pending_review"], "definition": "Estado de validación distinto de Confirmada."},
        {"label": "Resueltas o cerradas", "value": summary["resolved"], "definition": "Estado Resuelto o Cerrado."},
        {"label": "Rango", "value": f'{range_["from"]} a {range_["to"]}', "definition": "Fechas inclusivas según fecha de carga."},
    ]
    add_sheet(book, "Resumen", [("Indicador", "label", 32), ("Valor exacto", "value", 18), ("Definición", "definition", 58)], summary_rows)
    for title, key in [
        ("Clasificación", "categories"),
        ("Prioridades", "priorities"),
        ("Estados", "statuses"),
        ("Áreas", "areas"),
        ("Sedes", "venues"),
        ("Tendencia diaria", "daily"),
    ]:
        add_sheet(book, title, [("Categoría", "label", 38), ("Cantidad exacta", "value", 20)], data[key])
    add_sheet(book, "Servicios", [("Servicio", "service", 58), ("Calificación", "rating", 18), ("Respuestas exactas", "value", 20)], data["services"])
    detail = add_sheet(
        book,
        "Encuestas incluidas",
        [
            ("ID", "id", 10), ("Documento", "original_name", 48),
            ("Fecha de carga", "created_at", 24), ("Clasificación", "category", 20),
            ("Prioridad", "priority", 16), ("Estado", "status", 24),
            ("Confianza", "confidence", 14), ("Lugar de origen", "origin_place", 20),
        ],
        data["cases"],
    )
    for row in range(2, detail.max_row + 1):
        detail.cell(row, 7).number_format = "0.00%"
        value = detail.cell(row, 3).value
        if isinstance(value, str):
            try:
                detail.cell(row, 3).value = datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
                detail.cell(row, 3).number_format = "dd/mm/yyyy hh:mm"
            except ValueError:
                pass
    book.save(output_path)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
