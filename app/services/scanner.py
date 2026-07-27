import shutil
import subprocess
from pathlib import Path

from app.core.config import get_settings


settings = get_settings()


def detect_scanner() -> dict[str, object]:
    scanimage = shutil.which("scanimage")
    if not scanimage:
        return {
            "available": False,
            "backend": None,
            "devices": [],
            "message": "No se detectó integración directa con escáner. El sistema sigue optimizado para cargas masivas de archivos escaneados.",
        }

    try:
        result = subprocess.run(
            [scanimage, "-L"],
            check=False,
            capture_output=True,
            text=True,
            timeout=settings.scanner_timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "available": False,
            "backend": "scanimage",
            "devices": [],
            "message": f"No fue posible consultar el escáner: {exc}",
        }

    devices = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return {
        "available": bool(devices),
        "backend": "scanimage",
        "devices": devices,
        "message": "Escáner detectado y listo para captura directa." if devices else "No hay dispositivos SANE visibles en este equipo.",
    }


def capture_scan(output_dir: Path) -> Path:
    scanimage = shutil.which("scanimage")
    if not scanimage:
        raise RuntimeError("No hay integración directa con escáner disponible en este equipo.")

    output_path = output_dir / "scanner-capture.png"
    with output_path.open("wb") as handle:
        result = subprocess.run(
            [scanimage, "--format=png", "--resolution", "300"],
            check=False,
            stdout=handle,
            stderr=subprocess.PIPE,
            timeout=settings.scanner_timeout_seconds,
        )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="ignore") or "La captura del escáner falló.")

    return output_path
