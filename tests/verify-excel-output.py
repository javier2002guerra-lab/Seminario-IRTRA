import hashlib
import json
import re
import io
import xml.etree.ElementTree as ET
import sys
import zipfile
from datetime import datetime

from openpyxl import load_workbook


def expect(sheet, address, expected):
    actual = sheet[address].value
    if actual != expected:
        raise AssertionError(f"{sheet.title}!{address}: esperado {expected!r}, obtenido {actual!r}")


def verify_managerial(output, template):
    with zipfile.ZipFile(output) as package, zipfile.ZipFile(template) as source:
        assert package.testzip() is None
        assert "xl/vbaProject.bin" in package.namelist()
        assert "xl/calcChain.xml" not in package.namelist()
        for name in package.namelist():
            if not name.endswith(".xml"):
                continue
            content = package.read(name)
            namespaces = dict(item for _, item in ET.iterparse(io.BytesIO(content), events=("start-ns",)))
            root = ET.fromstring(content)
            for node in root.iter():
                for key, value in node.attrib.items():
                    if key == "{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable" or key == "Requires":
                        assert all(prefix in namespaces for prefix in value.split()), f"Prefijo sin declaración en {name}: {value}"
        assert hashlib.sha256(package.read("xl/vbaProject.bin")).digest() == hashlib.sha256(source.read("xl/vbaProject.bin")).digest()
        # All non-cell assets, including charts, drawings, buttons and VBA,
        # must remain byte-for-byte identical to the approved template.
        mutable = {"xl/workbook.xml", "xl/_rels/workbook.xml.rels", "[Content_Types].xml", "xl/calcChain.xml"}
        for name in source.namelist():
            if name not in mutable and not (name.startswith("xl/worksheets/") and name.endswith(".xml")):
                assert source.read(name) == package.read(name), f"Se alteró el recurso protegido {name}"
    book = load_workbook(output, keep_vba=True, data_only=False)
    source_book = load_workbook(template, keep_vba=True, data_only=False)
    structural_formulas = 0
    for sheet in source_book:
        for row in sheet:
            for cell in row:
                formula = cell.value
                if not isinstance(formula, str) or not formula.startswith("="):
                    continue
                # Pure numeric arithmetic is historical input bundled in the
                # original form, rather than a structural cell reference.
                if re.fullmatch(r"=\+?\d+(?:[+\-]\d+)*", formula.replace(" ", "")):
                    continue
                actual = book[sheet.title][cell.coordinate].value
                assert actual in [formula, f"=IFERROR({formula[1:]},0)"], f"Fórmula alterada: {sheet.title}!{cell.coordinate}: {formula} -> {actual}"
                structural_formulas += 1
    source_book.close()
    assert book.calculation.calcMode == "auto"
    direct = book["Preguntas directas"]
    for address, value in {
        "B4": 1, "C4": 0, "D4": 0, "H4": 1, "I4": 1, "J4": 1,
        "K4": 0, "O4": 1, "U4": 1, "Y4": 1, "AF4": 1, "AI4": 1,
        "C5": 1, "K5": 1, "P5": 1, "V5": 1, "Z5": 1, "AG5": 1,
        "D6": 1, "L6": 1, "Q6": 1, "V6": 1, "AA6": 1, "AK6": 1,
    }.items():
        expect(direct, address, value)
    quality = book["Nivel de Calidad"]
    for address, value in {"B4": 1, "AS4": 1, "BX4": 1, "BG4": 1, "BD5": 1, "BR6": 1}.items():
        expect(quality, address, value)
    categories = book["Sugerencia o Queja"]
    for address, value in {"C5": 1, "D5": 1, "C6": 1, "D7": 1}.items():
        expect(categories, address, value)
    expect(book["Sujerencias por departamento"], "C5", 1)
    expect(book["Sujerencias por departamento"], "D4", 1)
    expect(book["Quejas por departamento"], "C4", 1)
    expect(book["Quejas por departamento"], "E10", 1)
    restaurant = book["Calificacion La Hacienda"]
    for address, value in {"F4": 1, "I4": 1, "J4": 0, "O4": 1}.items():
        expect(restaurant, address, value)
    hotel = book["Calificacion  San Martin"]
    for address, value in {"C4": 1, "D4": 0, "E4": 0, "F4": 1}.items():
        expect(hotel, address, value)
    club = book["Calificacion Club Corozos"]
    for address, value in {"C4": 0, "E4": 1, "F4": 1, "C5": 1, "F5": 0}.items():
        expect(club, address, value)
    expect(book["Comentarios Negativos en Rest"], "B3", "Comida fría")
    expect(book["Comentarios Negativos en Rest"], "C3", 1)
    expect(book["Comentarios Negativos en Hotele"], "A4", "Comida fría")
    expect(book["Comentarios Negativos en Corozo"], "B4", "Comida fría")
    expect(book["QUEJAS ACUMULADAS POR AREA"], "E4", "Comida fría")
    expect(book["QUEJAS ACUMULADAS POR AREA"], "G4", "='Comentarios Negativos en Rest'!S3")
    assert book["Comentarios Negativos en Rest"]["S3"].value.startswith("=SUMIF(")
    expect(book["sugerencias mas Frecuentes"], "B6", "'=RIESGO")
    assert isinstance(direct["E4"].value, str) and direct["E4"].value.startswith("=")
    book.close()
    return {"format": "xlsm", "verified_cells": 58, "structural_formulas": structural_formulas, "macros_preserved": True}


def verify_statistical(output):
    with zipfile.ZipFile(output) as package:
        assert package.testzip() is None
    book = load_workbook(output, data_only=False)
    assert book.sheetnames == ["Resumen", "Clasificación", "Prioridades", "Estados", "Áreas", "Sedes", "Tendencia diaria", "Servicios", "Encuestas incluidas"]
    expect(book["Resumen"], "B2", 3)
    expect(book["Clasificación"], "A2", "'=RIESGO")
    expect(book["Clasificación"], "B2", 2)
    detail = book["Encuestas incluidas"]
    assert isinstance(detail["C2"].value, datetime)
    expect(detail, "G2", 0.95)
    assert detail["G2"].number_format == "0.00%"
    book.close()
    return {"format": "xlsx", "verified_cells": 5}


if __name__ == "__main__":
    mode = sys.argv[1]
    result = verify_managerial(sys.argv[2], sys.argv[3]) if mode == "managerial" else verify_statistical(sys.argv[2])
    print(json.dumps(result, ensure_ascii=False))
