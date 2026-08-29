"""Shared Storage-v2 constants and small deterministic helpers."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

STORAGE_SCHEMA_VERSION = 2
DOMAIN_SCHEMA_VERSION = 2
DEFAULT_STATUS = "draft"
VALID_STATUSES = {
    "draft",
    "evaluating",
    "ready",
    "applied",
    "interviewing",
    "offer",
    "rejected",
    "withdrawn",
    "closed",
}
VALID_JOB_STATUSES = {"new", "saved", "skipped", "applied"}
VALID_JOB_RECOMMENDATIONS = {"pursue", "consider", "skip"}
VALID_EVALUATION_CONFIDENCE = {"high", "medium", "low"}
VALID_CONSTRAINT_RESULTS = {"pass", "fail", "unclear"}
VALID_EVIDENCE_LEVELS = {"exact_files", "source_only", "status_only"}
VALID_SUBMISSION_CHANNELS = {
    "company_portal",
    "email",
    "recruiting_agent",
    "linkedin",
    "other",
}
VALID_ARTIFACT_ROLES = {"content_source", "editable_source", "deliverable", "supporting"}
VALID_ARTIFACT_ORIGINS = {
    "codex_generated",
    "user_uploaded",
    "external_export",
    "employer_template",
    "unknown",
}
VALID_ARTIFACT_PURPOSES = {
    "rirekisho",
    "shokumu_keirekisho",
    "employer_form",
    "portfolio",
    "other",
}
ALLOWED_DELIVERABLE_EXTENSIONS = {".pdf", ".docx"}
MAX_DELIVERABLE_BYTES = 20 * 1024 * 1024


class WorkspaceError(RuntimeError):
    """Raised when a workspace operation violates its contract."""


def now_iso() -> str:
    """Return a timezone-aware, microsecond-precision timestamp."""

    return datetime.now().astimezone().isoformat(timespec="microseconds")


def timestamp_id(value: datetime | None = None) -> str:
    """Return the stable timestamp format used for immutable record IDs."""

    current = (value or datetime.now().astimezone()).astimezone()
    return current.strftime("%Y-%m-%dT%H%M%S.%f%z")


def slugify(value: str) -> str:
    """Make a bounded, Unicode-friendly identifier fragment."""

    normalized = unicodedata.normalize("NFKC", value).strip().lower()
    slug = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE).strip("-_")
    slug = re.sub(r"[-_]{2,}", "-", slug)
    if not slug:
        slug = "item-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]
    return slug[:64].rstrip("-")


def canonical_json(value: Any) -> str:
    """Encode JSON deterministically for hashes and persisted payloads."""

    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def json_hash(value: Any) -> str:
    """Hash a JSON-compatible value using its canonical encoding."""

    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    """Hash a file without loading it into memory all at once."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_read(path: Path) -> Any:
    """Read a required UTF-8 JSON file and normalize its public error."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkspaceError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkspaceError(f"Invalid JSON in {path}: {exc}") from exc


def json_write(path: Path, data: Any, *, overwrite: bool = True) -> None:
    """Atomically write a JSON document with a trailing newline."""

    if path.exists() and not overwrite:
        raise WorkspaceError(f"Refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


__all__ = [
    "ALLOWED_DELIVERABLE_EXTENSIONS",
    "DEFAULT_STATUS",
    "DOMAIN_SCHEMA_VERSION",
    "MAX_DELIVERABLE_BYTES",
    "STORAGE_SCHEMA_VERSION",
    "VALID_ARTIFACT_ORIGINS",
    "VALID_ARTIFACT_PURPOSES",
    "VALID_ARTIFACT_ROLES",
    "VALID_CONSTRAINT_RESULTS",
    "VALID_EVALUATION_CONFIDENCE",
    "VALID_EVIDENCE_LEVELS",
    "VALID_JOB_RECOMMENDATIONS",
    "VALID_JOB_STATUSES",
    "VALID_STATUSES",
    "VALID_SUBMISSION_CHANNELS",
    "WorkspaceError",
    "canonical_json",
    "json_hash",
    "json_read",
    "json_write",
    "now_iso",
    "sha256_file",
    "slugify",
    "timestamp_id",
]
