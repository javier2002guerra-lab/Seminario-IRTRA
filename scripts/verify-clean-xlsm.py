import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def inspect(file_name):
    cached_formula_results = []
    numeric_constants = []
    nonzero_numeric_constants = []
    with zipfile.ZipFile(file_name, "r") as package:
        names = package.namelist()
        if "xl/vbaProject.bin" not in names:
            raise RuntimeError("La plantilla no contiene el proyecto VBA.")
        for name in names:
            if not name.startswith("xl/worksheets/sheet") or not name.endswith(".xml"):
                continue
            root = ET.fromstring(package.read(name))
            for cell in root.findall(".//x:c", NS):
                formula = cell.find("x:f", NS)
                value = cell.find("x:v", NS)
                raw = value.text if value is not None else None
                if formula is not None and raw not in (None, ""):
                    cached_formula_results.append((name, cell.attrib.get("r"), raw))
                elif formula is None and cell.attrib.get("t") in (None, "n") and raw not in (None, ""):
                    numeric_constants.append((name, cell.attrib.get("r"), raw))
                    try:
                        if Decimal(raw) != 0:
                            nonzero_numeric_constants.append((name, cell.attrib.get("r"), raw))
                    except InvalidOperation:
                        nonzero_numeric_constants.append((name, cell.attrib.get("r"), raw))
    return {
        "cached_formula_results": len(cached_formula_results),
        "numeric_constants": len(numeric_constants),
        "nonzero_numeric_constants": len(nonzero_numeric_constants),
        "examples": (cached_formula_results + nonzero_numeric_constants)[:10],
    }


if __name__ == "__main__":
    allow_zero = "--allow-zero" in sys.argv[1:]
    arguments = [item for item in sys.argv[1:] if item != "--allow-zero"]
    if len(arguments) != 1:
        raise SystemExit("Uso: verify-clean-xlsm.py [--allow-zero] <plantilla.xlsm>")
    report = inspect(Path(arguments[0]))
    print(json.dumps(report, ensure_ascii=False))
    numeric_failure = report["nonzero_numeric_constants"] if allow_zero else report["numeric_constants"]
    if report["cached_formula_results"] or numeric_failure:
        raise SystemExit("La plantilla contiene datos numéricos o resultados históricos en caché.")
