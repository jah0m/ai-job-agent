"""Mutable current-draft pointer backed by immutable draft revisions."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from pathlib import Path
from typing import Any, cast

from ..markdown_contract import REQUIRED_DOCUMENTS, TEMPLATE_REVISION
from .common import (
    ALLOWED_DELIVERABLE_EXTENSIONS,
    DOMAIN_SCHEMA_VERSION,
    MAX_DELIVERABLE_BYTES,
    WorkspaceError,
    canonical_json,
    now_iso,
)
from .database import StorageDatabase


class DraftStorageMixin(StorageDatabase):
    """Implement compare-and-swap draft edits without mutating old revisions."""

    def _draft_rows(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        revision: int | None = None,
    ) -> list[sqlite3.Row]:
        if revision is None:
            revision_row = connection.execute(
                "SELECT current_revision FROM drafts WHERE application_id=?", (application_id,)
            ).fetchone()
            if revision_row is None:
                raise WorkspaceError(f"Unknown draft for {application_id}")
            revision = revision_row["current_revision"]
        return connection.execute(
            "SELECT f.logical_path,f.artifact_sha256,f.metadata_json,a.size,a.media_type "
            "FROM draft_revisions r LEFT JOIN draft_revision_files f ON f.draft_revision_id=r.id "
            "LEFT JOIN artifacts a ON a.sha256=f.artifact_sha256 "
            "WHERE r.application_id=? AND r.revision=? AND f.logical_path IS NOT NULL ORDER BY f.logical_path",
            (application_id, revision),
        ).fetchall()

    def _current_draft(
        self, connection: sqlite3.Connection, application_id: str
    ) -> tuple[sqlite3.Row, sqlite3.Row]:
        draft = connection.execute(
            "SELECT * FROM drafts WHERE application_id=?", (application_id,)
        ).fetchone()
        if draft is None:
            raise WorkspaceError(f"Unknown draft for {application_id}")
        revision = connection.execute(
            "SELECT * FROM draft_revisions WHERE application_id=? AND revision=?",
            (application_id, draft["current_revision"]),
        ).fetchone()
        if revision is None:
            raise WorkspaceError(
                f"Missing draft revision {draft['current_revision']} for {application_id}"
            )
        return draft, revision

    def show_draft(self, application_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            draft, revision = self._current_draft(connection, application_id)
            files = [
                self._entry_from_row(row)
                for row in self._draft_rows(connection, application_id, draft["current_revision"])
            ]
        validation = self._validate_file_map({entry["path"]: entry for entry in files})
        result: dict[str, Any] = {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "kind": "draft",
            "application_id": application_id,
            "draft_id": draft["draft_id"],
            "status": draft["status"],
            "revision": draft["current_revision"],
            "base_package_id": revision["base_package_id"],
            "relative_path": None,
            "created_at": draft["created_at"],
            "updated_at": draft["updated_at"],
            "label": revision["label"],
            "template_revision": revision["template_revision"],
            "files": files,
            "validation": validation,
        }
        result["summary"] = {
            key: result.get(key)
            for key in (
                "schema_version",
                "draft_id",
                "status",
                "revision",
                "base_package_id",
                "relative_path",
                "created_at",
                "updated_at",
                "label",
                "template_revision",
                "validation",
            )
        }
        return result

    def draft_files(self, application_id: str) -> list[dict[str, Any]]:
        return cast(list[dict[str, Any]], self.show_draft(application_id)["files"])

    def draft_file_path(self, application_id: str, relative_path: str) -> Path:
        with self.connect() as connection:
            rows = self._draft_rows(connection, application_id)
        row = next((item for item in rows if item["logical_path"] == relative_path), None)
        if row is None:
            raise WorkspaceError(f"Unknown draft file: {relative_path}")
        return self.objects.path_for(row["artifact_sha256"])

    def draft_readiness(self, application_id: str) -> dict[str, Any]:
        return cast(dict[str, Any], self.show_draft(application_id)["validation"])

    def save_draft(
        self,
        application_id: str,
        *,
        source_directory: str | Path | None = None,
        documents: dict[str, bytes] | None = None,
        artifacts: dict[str, dict[str, Any]] | None = None,
        remove_paths: Iterable[str] | None = None,
        base_package_id: str | None = None,
        label: str | None = None,
        status: str = "working",
        actor: str = "cli",
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        if status != "working":
            raise WorkspaceError("Invalid current-materials status; expected working")
        if (
            source_directory is None
            and not documents
            and not artifacts
            and not remove_paths
            and not base_package_id
        ):
            raise WorkspaceError(
                "Current-materials save requires source files, uploads, removals, or a base package"
            )
        with self.connect() as connection:
            draft, current = self._current_draft(connection, application_id)
            current_revision = int(draft["current_revision"])
            if expected_revision is not None and expected_revision != current_revision:
                raise WorkspaceError(
                    f"Draft revision conflict: expected {expected_revision}, current {current_revision}"
                )
            if base_package_id:
                package = connection.execute(
                    "SELECT 1 FROM material_packages WHERE application_id=? AND id=? AND deleted_at IS NULL",
                    (application_id, base_package_id),
                ).fetchone()
                if package is None:
                    raise WorkspaceError(
                        f"Unknown material package {base_package_id} for {application_id}"
                    )
                rows = self._package_rows(connection, application_id, base_package_id)
            else:
                rows = self._draft_rows(connection, application_id, current_revision)
        entries = {row["logical_path"]: self._entry_from_row(row) for row in rows}

        if source_directory is not None:
            source_root = Path(source_directory).expanduser().resolve()
            if not source_root.is_dir():
                raise WorkspaceError(f"Artifact source is not a directory: {source_root}")
            for path in source_root.rglob("*"):
                if path.is_symlink():
                    raise WorkspaceError(f"Symbolic links are not allowed in artifacts: {path}")
                if not path.is_file() or path.name == "manifest.json":
                    continue
                relative = path.relative_to(source_root).as_posix()
                entries[relative] = self._put_entry(
                    relative, source=path, metadata={"source_path": str(path)}
                )

        for relative in remove_paths or ():
            if relative in REQUIRED_DOCUMENTS or not relative.startswith("deliverables/"):
                raise WorkspaceError(f"Only uploaded deliverables can be removed: {relative}")
            if relative not in entries:
                raise WorkspaceError(f"Unknown deliverable: {relative}")
            del entries[relative]

        for name, payload in (documents or {}).items():
            if name not in REQUIRED_DOCUMENTS:
                raise WorkspaceError(f"Only application Markdown can be saved: {name}")
            if len(payload) > 2 * 1024 * 1024:
                raise WorkspaceError(f"Markdown file is too large: {name}")
            try:
                content = payload.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise WorkspaceError(f"Markdown file must use UTF-8: {name}") from exc
            if not content.strip():
                raise WorkspaceError(f"Markdown file is empty: {name}")
            entries[name] = self._put_entry(
                name,
                payload=content.encode("utf-8"),
                metadata={"origin": "codex_generated"},
            )

        for original_name, artifact in (artifacts or {}).items():
            filename = Path(original_name).name
            if filename != original_name or not filename or filename.startswith("."):
                raise WorkspaceError(f"Unsafe deliverable filename: {original_name}")
            if Path(filename).suffix.lower() not in ALLOWED_DELIVERABLE_EXTENSIONS:
                raise WorkspaceError("Deliverables must be PDF or DOCX")
            artifact_payload = artifact.get("payload")
            if not isinstance(artifact_payload, bytes | bytearray) or not artifact_payload:
                raise WorkspaceError(f"Deliverable is empty: {filename}")
            if len(artifact_payload) > MAX_DELIVERABLE_BYTES:
                raise WorkspaceError(f"Deliverable is too large: {filename}")
            relative = f"deliverables/{filename}"
            entries[relative] = self._put_entry(
                relative,
                payload=bytes(artifact_payload),
                metadata={
                    "role": str(artifact.get("role") or "deliverable"),
                    "purpose": str(artifact.get("purpose") or "other"),
                    "origin": str(artifact.get("origin") or "user_uploaded"),
                    "source_path": artifact.get("source_path") or None,
                },
            )

        if not entries:
            raise WorkspaceError("Draft contains no files")
        validation = self._validate_file_map(entries)
        updated = now_iso()
        new_revision = current_revision + 1
        with self.connect() as connection:
            update_result = connection.execute(
                "UPDATE drafts SET current_revision=?,status='working',updated_at=? "
                "WHERE application_id=? AND current_revision=?",
                (new_revision, updated, application_id, current_revision),
            )
            if update_result.rowcount != 1:
                raise WorkspaceError("Current materials changed while they were being saved")
            revision_id = connection.execute(
                "INSERT INTO draft_revisions(application_id,revision,base_package_id,label,template_revision,"
                "validation_json,created_at,actor) VALUES(?,?,?,?,?,?,?,?)",
                (
                    application_id,
                    new_revision,
                    base_package_id or current["base_package_id"],
                    label if label is not None else current["label"],
                    TEMPLATE_REVISION,
                    canonical_json(validation),
                    updated,
                    actor,
                ),
            ).lastrowid
            for entry in entries.values():
                self._register_artifact(
                    connection,
                    entry["sha256"],
                    int(entry["size"]),
                    str(entry["media_type"]),
                    entry.get("original_filename") or Path(entry["path"]).name,
                )
                metadata = {
                    key: entry.get(key)
                    for key in ("role", "purpose", "origin", "media_type", "source_path")
                }
                connection.execute(
                    "INSERT INTO draft_revision_files(draft_revision_id,logical_path,artifact_sha256,metadata_json) "
                    "VALUES(?,?,?,?)",
                    (revision_id, entry["path"], entry["sha256"], canonical_json(metadata)),
                )
            connection.execute(
                "UPDATE applications SET updated_at=?,revision=revision+1 WHERE id=?",
                (updated, application_id),
            )
            self._add_event(
                connection,
                application_id,
                "draft.created" if current_revision == 0 else "draft.updated",
                {
                    "actor": actor,
                    "draft_id": draft["draft_id"],
                    "revision": new_revision,
                    "status": status,
                    "base_package_id": base_package_id or current["base_package_id"],
                    "validation": validation,
                },
            )
        return self.show_draft(application_id)

    def save_deliverable_file(
        self,
        application_id: str,
        *,
        filename: str,
        payload: bytes,
        purpose: str,
        role: str = "deliverable",
        origin: str = "user_uploaded",
        source_path: str | None = None,
        expected_revision: int | None = None,
        actor: str = "web",
    ) -> dict[str, Any]:
        return self.save_draft(
            application_id,
            artifacts={
                filename: {
                    "payload": payload,
                    "purpose": purpose,
                    "role": role,
                    "origin": origin,
                    "source_path": source_path,
                }
            },
            expected_revision=expected_revision,
            actor=actor,
        )

    def remove_deliverable_file(
        self,
        application_id: str,
        *,
        relative_path: str,
        expected_revision: int | None = None,
        actor: str = "web",
    ) -> dict[str, Any]:
        return self.save_draft(
            application_id,
            remove_paths=[relative_path],
            expected_revision=expected_revision,
            actor=actor,
        )

    def validate_draft(self, application_id: str, *, actor: str = "cli") -> dict[str, Any]:
        draft = self.show_draft(application_id)
        validated = now_iso()
        with self.connect() as connection:
            connection.execute(
                "UPDATE drafts SET updated_at=? WHERE application_id=?",
                (validated, application_id),
            )
            connection.execute(
                "UPDATE applications SET updated_at=? WHERE id=?",
                (validated, application_id),
            )
            self._add_event(
                connection,
                application_id,
                "draft.validated",
                {
                    "actor": actor,
                    "draft_id": draft["draft_id"],
                    "revision": draft["revision"],
                    "validation": draft["validation"],
                },
            )
        return self.show_draft(application_id)

    def restore_current_materials_from_package(
        self,
        application_id: str,
        *,
        package_id: str,
        actor: str = "web",
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        package = next(
            (item for item in self.list_packages(application_id) if item["id"] == package_id),
            None,
        )
        if package is None:
            raise WorkspaceError(f"Unknown material package {package_id} for {application_id}")
        return self.save_draft(
            application_id,
            base_package_id=package_id,
            label=f"恢复自 {package.get('label') or package_id}",
            actor=actor,
            expected_revision=expected_revision,
        )

    def discard_draft(
        self,
        application_id: str,
        *,
        actor: str = "web",
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        with self.connect() as connection:
            draft, _ = self._current_draft(connection, application_id)
            revision = int(draft["current_revision"])
            if expected_revision is not None and expected_revision != revision:
                raise WorkspaceError(
                    f"Draft revision conflict: expected {expected_revision}, current {revision}"
                )
            new_revision = revision + 1
            discarded = now_iso()
            update_result = connection.execute(
                "UPDATE drafts SET current_revision=?,status='empty',updated_at=? "
                "WHERE application_id=? AND current_revision=?",
                (new_revision, discarded, application_id, revision),
            )
            if update_result.rowcount != 1:
                raise WorkspaceError("Draft changed while it was being discarded")
            validation = self._validate_file_map({})
            connection.execute(
                "INSERT INTO draft_revisions(application_id,revision,base_package_id,label,template_revision,"
                "validation_json,created_at,actor) VALUES(?,?,NULL,NULL,?,?,?,?)",
                (
                    application_id,
                    new_revision,
                    TEMPLATE_REVISION,
                    canonical_json(validation),
                    discarded,
                    actor,
                ),
            )
            connection.execute(
                "UPDATE applications SET updated_at=?,revision=revision+1 WHERE id=?",
                (discarded, application_id),
            )
            self._add_event(
                connection,
                application_id,
                "draft.discarded",
                {
                    "actor": actor,
                    "draft_id": draft["draft_id"],
                    "previous_revision": revision,
                    "revision": new_revision,
                },
            )
        result = self.show_draft(application_id)
        result["trash_path"] = None
        return result


__all__ = ["DraftStorageMixin"]
