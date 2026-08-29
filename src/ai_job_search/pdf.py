from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .workspace import WorkspaceError


def _external_extract(path: Path) -> tuple[int, str, str]:
    pdfinfo = shutil.which("pdfinfo")
    pdftotext = shutil.which("pdftotext")
    if not pdfinfo or not pdftotext:
        raise WorkspaceError(
            "PDF verification requires the optional `pypdf` package or Poppler "
            "commands `pdfinfo` and `pdftotext`"
        )
    try:
        info = subprocess.run(
            [pdfinfo, str(path)], check=True, capture_output=True, text=True
        ).stdout
        text = subprocess.run(
            [pdftotext, "-layout", str(path), "-"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "PDF command failed").strip()
        raise WorkspaceError(f"Could not inspect PDF {path}: {detail}") from exc
    match = re.search(r"^Pages:\s+(\d+)\s*$", info, re.MULTILINE)
    if not match:
        raise WorkspaceError("pdfinfo output did not contain a page count")
    return int(match.group(1)), text, "poppler"


def extract_pdf(path: str | Path) -> tuple[int, str, str]:
    pdf_path = Path(path).expanduser().resolve()
    if not pdf_path.is_file():
        raise WorkspaceError(f"PDF does not exist: {pdf_path}")
    try:
        from pypdf import PdfReader
    except ImportError:
        return _external_extract(pdf_path)
    try:
        reader = PdfReader(pdf_path)
        text = "\n\f\n".join(page.extract_text() or "" for page in reader.pages)
        return len(reader.pages), text, "pypdf"
    except Exception as exc:
        raise WorkspaceError(f"Could not inspect PDF {pdf_path}: {exc}") from exc


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def verify_pdf(
    path: str | Path,
    *,
    expected_pages: int | None = None,
    min_characters: int = 1,
    required_text: tuple[str, ...] = (),
) -> dict[str, Any]:
    pdf_path = Path(path).expanduser().resolve()
    pages, raw_text, extractor = extract_pdf(pdf_path)
    text = normalize_text(raw_text)
    errors: list[str] = []
    warnings: list[str] = []
    if expected_pages is not None and pages != expected_pages:
        errors.append(f"expected {expected_pages} page(s), found {pages}")
    if len(text) < min_characters:
        errors.append(
            f"text layer has {len(text)} character(s); expected at least {min_characters}"
        )
    if "(cid:" in raw_text:
        errors.append("text layer contains unresolved (cid:*) glyph markers")
    if "\ufffd" in raw_text:
        errors.append("text layer contains Unicode replacement characters")
    for required in required_text:
        if normalize_text(required) not in text:
            errors.append(f"text layer is missing required text: {required!r}")
    if not required_text:
        warnings.append(
            "No required literal text was supplied; contact details and key headings were not checked"
        )
    return {
        "ok": not errors,
        "path": str(pdf_path),
        "pages": pages,
        "text_characters": len(text),
        "extractor": extractor,
        "errors": errors,
        "warnings": warnings,
    }
