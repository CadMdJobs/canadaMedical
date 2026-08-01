"""
Centralised file-upload validators.
Import these in any serializer that accepts user-uploaded files.
"""
import logging
from rest_framework import serializers

logger = logging.getLogger(__name__)

# ── Resume / document ─────────────────────────────────────────────────────────
ALLOWED_RESUME_EXTENSIONS = frozenset(["pdf", "doc", "docx"])
MAX_RESUME_SIZE = 5 * 1024 * 1024  # 5 MB

_RESUME_MAGIC = {
    b"%PDF",          # PDF
    b"\xd0\xcf\x11\xe0",  # DOC (OLE2 compound)
    b"PK\x03\x04",   # DOCX / XLSX / ZIP-based Office formats
}

# ── Image (avatar / logo) ─────────────────────────────────────────────────────
ALLOWED_IMAGE_EXTENSIONS = frozenset(["jpg", "jpeg", "png", "webp"])
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

_IMAGE_MAGIC: dict[bytes, str] = {
    b"\xff\xd8\xff": "jpeg",          # JPEG/JPG
    b"\x89PNG\r\n\x1a\n": "png",     # PNG
    b"RIFF": "webp",                  # WebP (bytes 0-3; bytes 8-11 = "WEBP")
}


def _read_header(file, n: int = 12) -> bytes:
    header = file.read(n)
    file.seek(0)
    return header


def validate_resume_file(file) -> object:
    ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
    if ext not in ALLOWED_RESUME_EXTENSIONS:
        raise serializers.ValidationError(
            f"Only {', '.join(e.upper() for e in ALLOWED_RESUME_EXTENSIONS)} files are allowed."
        )
    if file.size > MAX_RESUME_SIZE:
        raise serializers.ValidationError("Resume must not exceed 5 MB.")

    header = _read_header(file, 4)
    if not any(header.startswith(magic) for magic in _RESUME_MAGIC):
        raise serializers.ValidationError(
            "File content does not match the declared type. Upload a genuine PDF, DOC, or DOCX."
        )
    return file


def validate_image_file(file) -> object:
    ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise serializers.ValidationError(
            f"Only {', '.join(e.upper() for e in ALLOWED_IMAGE_EXTENSIONS)} images are allowed."
        )
    if file.size > MAX_IMAGE_SIZE:
        raise serializers.ValidationError("Image must not exceed 5 MB.")

    header = _read_header(file, 12)

    # JPEG
    if header[:3] == b"\xff\xd8\xff":
        return file
    # PNG
    if header[:8] == b"\x89PNG\r\n\x1a\n":
        return file
    # WebP: "RIFF????WEBP"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return file

    raise serializers.ValidationError(
        "File content does not match the declared image type. "
        "Upload a genuine JPEG, PNG, or WebP image."
    )
