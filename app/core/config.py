from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="IRTRA Calidad IA", validation_alias="IRTRA_APP_NAME")
    debug: bool = Field(default=False, validation_alias="IRTRA_DEBUG")
    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-5", validation_alias="OPENAI_MODEL")
    openai_timeout_seconds: int = Field(default=90, validation_alias="IRTRA_OPENAI_TIMEOUT")
    vision_max_dimension: int = Field(default=3600, validation_alias="IRTRA_VISION_MAX_DIMENSION")
    database_url: str = Field(
        default=f"sqlite:///{(BASE_DIR / 'data' / 'app.db').as_posix()}",
        validation_alias="IRTRA_DATABASE_URL",
    )
    data_dir: Path = BASE_DIR / "data"
    upload_dir: Path = BASE_DIR / "uploads"
    max_file_size_mb: int = 50
    accepted_extensions: tuple[str, ...] = ("pdf", "jpg", "jpeg", "png")
    accepted_mime_types: tuple[str, ...] = (
        "application/pdf",
        "image/jpeg",
        "image/png",
    )
    default_services: list[str] = Field(
        default_factory=lambda: [
            "Cortesía del personal",
            "Prontitud en chequeo de ingreso y salida",
            "Limpieza de habitaciones",
            "Limpieza de sanitarios",
            "Mantenimiento de instalaciones",
            "Jardines",
            "Servicio de maleteros",
            "Calidad de comida",
            "Prontitud en revisión de inventarios",
            "Servicio Club Los Corozos",
            "Servicio en tiendas de conveniencia",
            "Servicio en personal de eventos",
            "Servicio en Restaurante",
            "Personal de seguridad",
        ]
    )
    default_departments: list[str] = Field(
        default_factory=lambda: [
            "Los Hostales",
            "Recepción",
            "Restaurante",
            "Club Los Corozos",
            "Tiendas de conveniencia",
            "Eventos",
            "Seguridad",
            "Mantenimiento",
            "Habitaciones",
        ]
    )
    scanner_timeout_seconds: int = 45

    @property
    def catalog_path(self) -> Path:
        return self.data_dir / "catalog.json"

    @property
    def excel_template_dir(self) -> Path:
        return self.data_dir / "excel_templates"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.excel_template_dir.mkdir(parents=True, exist_ok=True)
    return settings
