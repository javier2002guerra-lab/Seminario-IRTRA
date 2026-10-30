import hashlib, json, sys, zipfile
from pathlib import Path
from openpyxl import load_workbook

file, mode = Path(sys.argv[1]), sys.argv[2]
with zipfile.ZipFile(file) as package:
    assert package.testzip() is None
    if mode == "managerial":
        template = Path("data/excel_templates/INFORME GERENCIAL ENCUESTAS.xlsm")
        with zipfile.ZipFile(template) as source:
            assert package.read("xl/vbaProject.bin") == source.read("xl/vbaProject.bin")
            for name in source.namelist():
                if name.startswith(("xl/charts/", "xl/drawings/", "xl/ctrlProps/")):
                    assert package.read(name) == source.read(name), name
book = load_workbook(file, keep_vba=mode == "managerial", data_only=False)
if mode == "managerial":
    assert book["Preguntas directas"]["B4"].value == 1
    assert book["Preguntas directas"]["O4"].value == 1
    assert book["Nivel de Calidad"]["AS4"].value == 1
    assert book["Calificacion La Hacienda"]["I4"].value == 1
    assert book.calculation.calcMode == "auto"
else:
    assert book["Resumen"]["B2"].value == 1
book.close()
print(json.dumps({"valid": True, "mode": mode, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}))
