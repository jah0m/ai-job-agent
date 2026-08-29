"""Artifact metadata, staging paths, and materialization helpers."""

from __future__ import annotations

import json
import mimetypes
import shutil
import sqlite3
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from ..markdown_contract import validate_application_documents
from .common import (
    VALID_ARTIFACT_ORIGINS,
    VALID_ARTIFACT_PURPOSES,
    VALID_ARTIFACT_ROLES,
    WorkspaceError,
    now_iso,
    sha256_file,
    slugify,
)
from .database import StorageDatabase


class ArtifactStorageMixin(StorageDatabase):
    """Coordinate workspace-local paths with the immutable object store."""

    @staticmethod
    def _canonical_url(value: str) -> str:
        value = value.strip()
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise WorkspaceError(f"Job result has an invalid URL: {value!r}")
        return urlunsplit(
            (
                parsed.scheme.lower(),
                parsed.netloc.lower(),
                parsed.path.rstrip("/"),
                parsed.query,
                "",
            )
        )

    def _relative(self, path: Path) -> str:
        try:
            return path.resolve().relative_to(self.root).as_posix()
        except ValueError as exc:
            raise WorkspaceError(f"Path escapes the private workspace: {path}") from exc

    @staticmethod
    def _media_type(path: Path) -> str:
        if path.suffix.lower() == ".docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return mimetypes.guess_type(path.name)[0] or "application/octet-stream"

    @staticmethod
    def _register_artifact(
        connection: sqlite3.Connection,
        digest: str,
        size: int,
        media_type: str,
        original_filename: str | None,
    ) -> None:
        connection.execute(
            "INSERT INTO artifacts(sha256,size,media_type,original_filename,created_at) "
            "VALUES(?,?,?,?,?) ON CONFLICT(sha256) DO NOTHING",
            (digest, size, media_type, original_filename, now_iso()),
        )
        row = connection.execute("SELECT size FROM artifacts WHERE sha256=?", (digest,)).fetchone()
        if row is None or int(row["size"]) != size:
            raise WorkspaceError(f"Artifact metadata conflicts for {digest}")

    def describe_job_evidence(
        self,
        *,
        portal: str,
        url: str,
        snapshot: str | Path,
        retriever: str | None = None,
    ) -> dict[str, Any]:
        self.require_initialized()
        snapshot_path = Path(snapshot).expanduser().resolve()
        staging_roots = [(self.root / "cache").resolve(), (self.root / "operations").resolve()]
        if not any(self._is_below(snapshot_path, root) for root in staging_roots):
            raise WorkspaceError(
                f"Job evidence snapshot must be under {staging_roots[0]} or {staging_roots[1]}: {snapshot_path}"
            )
        if not snapshot_path.is_file():
            raise WorkspaceError(f"Job evidence snapshot is not a file: {snapshot_path}")
        result: dict[str, Any] = {
            "provider": slugify(portal),
            "detail_url": self._canonical_url(url),
            "retrieved_at": now_iso(),
            "snapshot_path": self._relative(snapshot_path),
            "snapshot_sha256": sha256_file(snapshot_path),
        }
        if retriever is not None:
            retriever = retriever.strip()
            if not retriever:
                raise WorkspaceError("Job evidence retriever cannot be blank")
            result["retriever"] = retriever
        return result

    def _artifact_relative_path(self, digest: str) -> str:
        return (Path("objects") / "sha256" / digest[:2] / digest[2:]).as_posix()

    @staticmethod
    def _infer_artifact_metadata(relative_path: str) -> dict[str, Any]:
        name = Path(relative_path).name.lower()
        extension = Path(name).suffix.lower()
        if "shokumu" in name or "職務経歴" in name:
            purpose = "shokumu_keirekisho"
        elif "rirekisho" in name or "履歴書" in name:
            purpose = "rirekisho"
        else:
            purpose = "other"
        role = (
            "content_source"
            if extension == ".md"
            else "deliverable"
            if extension == ".pdf"
            else "editable_source"
            if extension == ".docx"
            else "supporting"
        )
        media_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
        if extension == ".docx":
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return {
            "role": role,
            "purpose": purpose,
            "origin": "unknown",
            "media_type": media_type,
            "source_path": None,
        }

    @staticmethod
    def _entry_from_row(row: sqlite3.Row) -> dict[str, Any]:
        metadata = row["metadata_json"]
        if not isinstance(metadata, str):
            raise WorkspaceError("Artifact metadata is not JSON text")
        return {
            "path": row["logical_path"],
            "size": row["size"],
            "sha256": row["artifact_sha256"],
            **_metadata_dict(metadata),
        }

    @contextmanager
    def _materialized(self, entries: dict[str, dict[str, Any]]) -> Iterator[Path]:
        root = Path(tempfile.mkdtemp(prefix="materialize-", dir=self.root / "operations"))
        try:
            for logical_path, entry in entries.items():
                relative = Path(logical_path)
                if relative.is_absolute() or ".." in relative.parts:
                    raise WorkspaceError(f"Unsafe artifact logical path: {logical_path}")
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.objects.path_for(entry["sha256"]), target)
            yield root
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def _validate_file_map(self, entries: dict[str, dict[str, Any]]) -> dict[str, Any]:
        with self._materialized(entries) as directory:
            return validate_application_documents(directory)

    def _put_entry(
        self,
        logical_path: str,
        *,
        source: Path | None = None,
        payload: bytes | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        relative = Path(logical_path)
        if relative.is_absolute() or ".." in relative.parts or not logical_path:
            raise WorkspaceError(f"Unsafe artifact logical path: {logical_path}")
        if source is not None:
            digest, size, _ = self.objects.put_file(source)
            filename = source.name
        elif payload is not None:
            digest, size, _ = self.objects.put_bytes(payload)
            filename = relative.name
        else:
            raise WorkspaceError("Artifact input is missing")
        inferred = self._infer_artifact_metadata(logical_path)
        for key in ("role", "purpose", "origin", "media_type", "source_path"):
            if metadata and key in metadata:
                inferred[key] = metadata[key]
        if inferred["role"] not in VALID_ARTIFACT_ROLES:
            raise WorkspaceError(f"Unknown artifact role: {inferred['role']}")
        if inferred["purpose"] not in VALID_ARTIFACT_PURPOSES:
            raise WorkspaceError(f"Unknown artifact purpose: {inferred['purpose']}")
        if inferred["origin"] not in VALID_ARTIFACT_ORIGINS:
            raise WorkspaceError(f"Unknown artifact origin: {inferred['origin']}")
        return {
            "path": relative.as_posix(),
            "size": size,
            "sha256": digest,
            "original_filename": filename,
            **inferred,
        }


def _metadata_dict(value: str) -> dict[str, Any]:
    """Decode row metadata while keeping malformed database state explicit."""

    try:
        metadata = json.loads(value)
    except json.JSONDecodeError as exc:
        raise WorkspaceError("Artifact metadata contains invalid JSON") from exc
    if not isinstance(metadata, dict):
        raise WorkspaceError("Artifact metadata must be a JSON object")
    return metadata


__all__ = ["ArtifactStorageMixin"]
