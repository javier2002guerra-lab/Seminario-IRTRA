import importlib.metadata
import json
import re
import sys
from pathlib import Path


def canonical(value):
    return re.sub(r"[-_.]+", "-", value).lower()


lock_path = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
expected = {}
for raw_line in lock_path.read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    name, separator, version = line.partition("==")
    if not separator or not name or not version:
        raise SystemExit(f"Dependencia no fijada en {lock_path.name}: {line}")
    expected[canonical(name)] = version

installed = {}
if target.is_dir():
    for distribution in importlib.metadata.distributions(path=[str(target)]):
        name = distribution.metadata.get("Name")
        if name:
            installed[canonical(name)] = distribution.version
    # Algunos entornos restringidos permiten enumerar el destino, pero no leer
    # METADATA. La pareja directorio de paquete + dist-info versionado sigue
    # siendo una comprobación determinista contra el lockfile.
    entries = {entry.name.lower() for entry in target.iterdir()}
    for name, version in expected.items():
        module = name.replace("-", "_")
        dist_info = f"{module}-{version}.dist-info".lower()
        if module.lower() in entries and dist_info in entries:
            installed.setdefault(name, version)

missing = {
    name: {"expected": version, "installed": installed.get(name)}
    for name, version in expected.items()
    if installed.get(name) != version
}
print(json.dumps({"ready": not missing, "missing_or_mismatched": missing}, sort_keys=True))
raise SystemExit(0 if not missing else 1)
