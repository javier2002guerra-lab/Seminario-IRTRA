import os
import re
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path


CELL = re.compile(rb"(<(?:\w+:)?c\b[^>]*>)(.*?)(</(?:\w+:)?c>)", re.DOTALL)
FORMULA = re.compile(rb"<(?:\w+:)?f\b")
VALUE = re.compile(rb"<(?:\w+:)?v>.*?</(?:\w+:)?v>", re.DOTALL)


def clear_formula_cache(file_name):
    source = Path(file_name).resolve()
    descriptor, temporary_name = tempfile.mkstemp(prefix="irtra-clean-cache-", suffix=".xlsm")
    os.close(descriptor)
    temporary = Path(temporary_name)
    removed = 0
    try:
        with zipfile.ZipFile(source, "r") as current, zipfile.ZipFile(temporary, "w") as clean:
            for info in current.infolist():
                data = current.read(info.filename)
                if info.filename.startswith("xl/worksheets/sheet") and info.filename.endswith(".xml"):
                    def clean_cell(match):
                        nonlocal removed
                        body = match.group(2)
                        if not FORMULA.search(body):
                            return match.group(0)
                        updated, count = VALUE.subn(b"", body)
                        removed += count
                        return match.group(1) + updated + match.group(3)

                    data = CELL.sub(clean_cell, data)
                clean.writestr(info, data)
        shutil.copyfile(temporary, source)
    finally:
        temporary.unlink(missing_ok=True)
    return removed


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Uso: clear-xlsm-formula-cache.py <archivo.xlsm>")
    print(f"cached_formula_results_removed={clear_formula_cache(sys.argv[1])}")
