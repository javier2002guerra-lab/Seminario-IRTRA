"""Exercise every month, service, visible rating and institutional venue."""
import importlib.util
import json
import tempfile
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string

spec = importlib.util.spec_from_file_location("fill", "scripts/fill-managerial-template.py")
fill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fill)
qualities = ["Excelente", "Bueno", "Regular", "Malo"]
restaurants = ["LA HACIENDA", "AREKAS", "KAPAHAPA", "COROZOS"]
hotels = ["SAN MARTIN", "PALAJUNOJ", "SANTA CRUZ", "RANCHERIA"]
rows = []
for month in range(1, 13):
    for service in fill.SERVICE_COLUMNS:
        for quality_index, quality in enumerate(qualities):
            rows.append({"id": len(rows) + 1, "category": "Sin observaciones", "primary_topic": "Sin observaciones",
                         "restaurant": restaurants[quality_index], "hotel": hotels[quality_index], "areas": [],
                         "general": {"visit_date": f"01/{month:02d}/2099", "affiliate_status": "Sí", "visit_reason": "Huésped"},
                         "numbered": {"item_7": "Sí" if quality_index % 2 == 0 else "No"},
                         "ratings": [{"service_name": service, "rating": quality}]})
checks = 0
def expect(book, sheet, cell, value):
    global checks
    actual = book[sheet][cell].value
    assert actual == value, (sheet, cell, value, actual)
    checks += 1

with tempfile.TemporaryDirectory(prefix="irtra-excel-matrix-") as temporary:
    input_path = Path(temporary) / "input.json"
    output_path = Path(temporary) / "output.xlsm"
    input_path.write_text(json.dumps(rows), encoding="utf8")
    fill.main("data/excel_templates/INFORME GERENCIAL ENCUESTAS.xlsm", str(input_path), str(output_path))
    book = load_workbook(output_path, keep_vba=True)
    for month, row in fill.month_rows(book["Nivel de Calidad"]).items():
        for service, column in fill.SERVICE_COLUMNS.items():
            for offset in range(4):
                actual = book["Nivel de Calidad"].cell(row, column_index_from_string(column) + offset).value
                assert actual == 1, (month, service, offset, actual)
                checks += 1
    for month, row in fill.month_rows(book["Preguntas directas"]).items():
        for column, value in {"B": 56, "C": 0, "D": 0, "O": 28, "P": 28, "Q": 0, "V": 56}.items():
            expect(book, "Preguntas directas", f"{column}{row}", value)
    for sheet, positive, regular, bad in [
        ("Calificacion La Hacienda", 1, 0, 0), ("Calificacion Las Arecas", 1, 0, 0),
        ("Calificacion Kapa Hapa", 0, 1, 0), ("Calificacion Rest. Corozos", 0, 0, 1),
    ]:
        for month, row in fill.month_rows(book[sheet]).items():
            for column, value in {"I": positive, "J": regular, "K": bad, "N": positive, "O": regular, "P": bad, "F": 0}.items():
                expect(book, sheet, f"{column}{row}", value)
    relevant = len(fill.HOTEL_RELEVANT_SERVICES)
    for sheet, positive, regular, bad in [
        ("Calificacion  San Martin", relevant, 0, 0), ("Calificacion  Palajunoj", relevant, 0, 0),
        ("Calificacion  Santa Cruz", 0, relevant, 0), ("Calificacion Rancheria", 0, 0, relevant),
    ]:
        for month, row in fill.month_rows(book[sheet]).items():
            for column, value in {"C": positive, "D": regular, "E": bad, "F": 0}.items():
                expect(book, sheet, f"{column}{row}", value)
    for month, row in fill.month_rows(book["Calificacion Club Corozos"]).items():
        for column, value in {"C": 2, "D": 1, "E": 1, "F": 0}.items():
            expect(book, "Calificacion Club Corozos", f"{column}{row}", value)
    book.close()
result = {"passed": True, "synthetic_surveys": len(rows), "months": 12, "services": 14, "rating_options": 4,
          "restaurants": 4, "hotels": 4, "verified_cells": checks}
Path("auditoria/evidencias/EXCEL_MATRIZ_RESULTADO.json").write_text(json.dumps(result, indent=2), encoding="utf8")
print(json.dumps(result))
