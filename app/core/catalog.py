import json

from app.core.config import get_settings


settings = get_settings()


def ensure_catalog() -> None:
    if not settings.catalog_path.exists():
        data = {
            "services": settings.default_services,
            "departments": settings.default_departments,
        }
        settings.catalog_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def load_catalog() -> dict[str, list[str]]:
    ensure_catalog()
    data = json.loads(settings.catalog_path.read_text(encoding="utf-8"))
    services = [value.strip() for value in data.get("services", []) if value.strip()]
    departments = [
        value.strip()
        for value in data.get("departments", [])
        if isinstance(value, str) and value.strip()
    ]
    if not services:
        services = settings.default_services
    if not departments:
        departments = settings.default_departments
    return {"services": services, "departments": departments}


def save_catalog(services: list[str], departments: list[str]) -> None:
    unique_services = []
    for service in services:
        clean = service.strip()
        if clean and clean not in unique_services:
            unique_services.append(clean)
    if not unique_services:
        raise ValueError("Debes configurar al menos un servicio.")

    unique_departments = []
    for department in departments:
        clean = department.strip()
        if clean and clean not in unique_departments:
            unique_departments.append(clean)

    settings.catalog_path.write_text(
        json.dumps(
            {"services": unique_services, "departments": unique_departments},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
