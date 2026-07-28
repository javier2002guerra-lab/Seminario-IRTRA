import json
import sys
import zipfile
from pathlib import Path


EXPECTED_ACTIONS = {
    "xl/drawings/drawing8.xml": "Elipse1_Haga_clic_en",
    "xl/drawings/drawing14.xml": "ORDENCOMNEGAHOTTOTAL",
    "xl/drawings/drawing14.xml#recepcion": "ORDENCOMNEGARECEPCION",
    "xl/drawings/drawing19.xml": "REGRESARQUEJASMASFRECUENTES",
}


def verify(file_name):
    missing = []
    with zipfile.ZipFile(Path(file_name), "r") as package:
        for location, macro in EXPECTED_ACTIONS.items():
            member = location.split("#", 1)[0]
            if member not in package.namelist() or macro.encode("utf-8") not in package.read(member):
                missing.append({"member": member, "macro": macro})
    return {
        "expected_actions": len(EXPECTED_ACTIONS),
        "missing_actions": missing,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: verify-xlsm-buttons.py <archivo.xlsm>")
    report = verify(sys.argv[1])
    print(json.dumps(report, ensure_ascii=False))
    if report["missing_actions"]:
        raise SystemExit("Faltan acciones requeridas en los botones de la plantilla.")
