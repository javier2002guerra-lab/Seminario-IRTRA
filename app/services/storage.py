import base64
import hashlib
import mimetypes
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

from app.core.config import get_settings


settings = get_settings()


class FileValidationError(ValueError):
    pass


@dataclass
class SavedUpload:
    original_filename: str
    stored_filename: str
    storage_path: Path
    mime_type: str
    extension: str
    file_size: int
    sha256_hash: str


@dataclass
class PreparedDocument:
    original_filename: str
    source_path: Path
    mime_type: str
    optimized_path: Path
    optimized_mime_type: str
    scanner_detected: bool
    data_url: str | None = None
    analysis_images: list[tuple[str, str]] | None = None


def _guess_mime(filename: str, provided_mime: str | None) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    mime = (provided_mime or guessed or "").lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    return mime


def _validate_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower().replace(".", "")
    if extension not in settings.accepted_extensions:
        raise FileValidationError(
            "Formato no permitido. Solo se aceptan archivos PDF, JPG, JPEG y PNG."
        )
    return extension


async def save_upload(upload: UploadFile) -> SavedUpload:
    filename = upload.filename or "archivo"
    extension = _validate_extension(filename)
    mime_type = _guess_mime(filename, upload.content_type)
    if mime_type not in settings.accepted_mime_types:
        raise FileValidationError(
            "Tipo MIME no permitido. Solo se aceptan PDF, JPG, JPEG y PNG."
        )

    content = await upload.read()
    if not content:
        raise FileValidationError("El archivo viene vacío.")

    max_size_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(content) > max_size_bytes:
        raise FileValidationError(
            f"El archivo supera el límite de {settings.max_file_size_mb} MB."
        )

    sha256_hash = hashlib.sha256(content).hexdigest()
    stored_filename = f"{uuid.uuid4().hex}.{extension}"
    storage_path = settings.upload_dir / stored_filename
    storage_path.write_bytes(content)

    return SavedUpload(
        original_filename=filename,
        stored_filename=stored_filename,
        storage_path=storage_path,
        mime_type=mime_type,
        extension=extension,
        file_size=len(content),
        sha256_hash=sha256_hash,
    )


def prepare_document_for_ai(saved_path: Path, mime_type: str, original_filename: str) -> PreparedDocument:
    if mime_type == "application/pdf":
        return PreparedDocument(
            original_filename=original_filename,
            source_path=saved_path,
            mime_type=mime_type,
            optimized_path=saved_path,
            optimized_mime_type=mime_type,
            scanner_detected=False,
        )

    image = Image.open(saved_path)
    image = ImageOps.exif_transpose(image)
    scanner_detected = _is_scanner_like(image)
    image = _enhance_document_image(image, scanner_detected)
    optimized_path = saved_path
    optimized_mime_type = mime_type
    data_url = None

    if scanner_detected or max(image.size) > settings.vision_max_dimension:
        optimized_path = saved_path.with_name(f"{saved_path.stem}-optimized.jpg")
        converted = image.convert("L" if scanner_detected else "RGB")
        if max(converted.size) > settings.vision_max_dimension:
            converted.thumbnail((settings.vision_max_dimension, settings.vision_max_dimension))
        converted.save(
            optimized_path,
            format="JPEG",
            quality=90,
            optimize=True,
        )
        optimized_mime_type = "image/jpeg"
    else:
        optimized_path = saved_path.with_name(f"{saved_path.stem}-normalized{saved_path.suffix}")
        image.save(optimized_path)

    encoded = base64.b64encode(optimized_path.read_bytes()).decode("utf-8")
    data_url = f"data:{optimized_mime_type};base64,{encoded}"
    analysis_images = _build_analysis_images(optimized_path, optimized_mime_type)

    return PreparedDocument(
        original_filename=original_filename,
        source_path=saved_path,
        mime_type=mime_type,
        optimized_path=optimized_path,
        optimized_mime_type=optimized_mime_type,
        scanner_detected=scanner_detected,
        data_url=data_url,
        analysis_images=analysis_images,
    )


def _is_scanner_like(image: Image.Image) -> bool:
    preview = image.convert("RGB")
    preview.thumbnail((300, 300))
    stat = ImageStat.Stat(preview)

    if len(stat.mean) < 3:
        return True

    channel_distance = (
        abs(stat.mean[0] - stat.mean[1])
        + abs(stat.mean[1] - stat.mean[2])
        + abs(stat.mean[0] - stat.mean[2])
    ) / 3
    grayscale_like = channel_distance < 8
    high_resolution = image.width >= 1200 and image.height >= 1600

    return grayscale_like and high_resolution


def load_bytesio(path: Path) -> BytesIO:
    return BytesIO(path.read_bytes())


def _enhance_document_image(image: Image.Image, scanner_detected: bool) -> Image.Image:
    working = image.convert("RGB")
    if scanner_detected:
        working = ImageOps.grayscale(working)
        working = ImageOps.autocontrast(working, cutoff=2)
        working = working.filter(ImageFilter.SHARPEN)
        return working

    working = ImageOps.autocontrast(working, cutoff=1)
    working = ImageEnhance.Contrast(working).enhance(1.15)
    working = working.filter(ImageFilter.SHARPEN)
    return working


def _build_analysis_images(image_path: Path, mime_type: str) -> list[tuple[str, str]]:
    image = Image.open(image_path)
    image = ImageOps.exif_transpose(image)
    width, height = image.size

    regions = [
        ("Imagen completa", image),
        ("Recorte superior: encabezado y preguntas 1 a 5", image.crop((0, 0, width, int(height * 0.34)))),
        ("Recorte central: tabla de servicios", image.crop((0, int(height * 0.25), width, int(height * 0.68)))),
        ("Recorte inferior: preguntas 7 a 14", image.crop((0, int(height * 0.62), width, height))),
    ]

    return [
        (label, _image_to_data_url(region, mime_type))
        for label, region in regions
    ]


def _image_to_data_url(image: Image.Image, mime_type: str) -> str:
    buffer = BytesIO()
    target = image.convert("RGB") if mime_type == "image/jpeg" else image
    save_format = "JPEG" if mime_type == "image/jpeg" else "PNG"
    save_kwargs = {"format": save_format}
    if save_format == "JPEG":
        save_kwargs.update({"quality": 92, "optimize": True})
    target.save(buffer, **save_kwargs)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"
