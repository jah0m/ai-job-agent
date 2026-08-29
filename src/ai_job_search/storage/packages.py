"""Immutable material packages, submissions, and evidence levels."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from .common import (
    ALLOWED_DELIVERABLE_EXTENSIONS,
    DOMAIN_SCHEMA_VERSION,
    VALID_EVIDENCE_LEVELS,
    VALID_SUBMISSION_CHANNELS,
    WorkspaceError,
    canonical_json,
    now_iso,
    timestamp_id,
)
from .database import StorageDatabase


class PackageStorageMixin(StorageDatabase):
    """Freeze material snapshots and record immutable submission evidence."""

    def _package_rows(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        package_id: str,
    ) -> list[sqlite3.Row]:
        return connection.execute(
            "SELECT f.logical_path,f.artifact_sha256,f.metadata_json,a.size,a.media_type "
            "FROM package_files f JOIN artifacts a ON a.sha256=f.artifact_sha256 "
            "WHERE f.application_id=? AND f.package_id=? ORDER BY f.logical_path",
            (application_id, package_id),
        ).fetchall()

    def lock_current_materials(
        self,
        application_id: str,
        *,
        label: str | None = None,
        actor: str = "system",
        expected_revision: int | None = None,
        created: datetime | None = None,
        require_content_ready: bool = False,
    ) -> dict[str, Any]:
        created_at = (
            (created or datetime.now().astimezone()).astimezone().isoformat(timespec="microseconds")
        )
        package_id = timestamp_id(created)
        with self.connect() as connection:
            draft, revision_row = self._current_draft(connection, application_id)
            revision = int(draft["current_revision"])
            if expected_revision is not None and expected_revision != revision:
                raise WorkspaceError(
                    f"Draft revision conflict: expected {expected_revision}, current {revision}"
                )
            rows = self._draft_rows(connection, application_id, revision)
            if not rows:
                raise WorkspaceError("Current materials contain no files")
            entries = {row["logical_path"]: self._entry_from_row(row) for row in rows}
            readiness = self._validate_file_map(entries)
            if require_content_ready and not readiness["ready"]:
                problems = (
                    readiness["missing"]
                    + readiness["errors"]
                    + [f"{name} 仍有要确认占位符" for name in readiness["placeholders"]]
                )
                raise WorkspaceError("Current content cannot be locked: " + "; ".join(problems))
            package_label = label or revision_row["label"] or f"申请材料 revision {revision}"
            try:
                connection.execute(
                    "INSERT INTO material_packages(id,application_id,source_draft_revision_id,created_at,label,template_revision) "
                    "VALUES(?,?,?,?,?,?)",
                    (
                        package_id,
                        application_id,
                        revision_row["id"],
                        created_at,
                        package_label,
                        revision_row["template_revision"],
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise WorkspaceError(f"Material package already exists: {package_id}") from exc
            for row in rows:
                connection.execute(
                    "INSERT INTO package_files(application_id,package_id,logical_path,artifact_sha256,metadata_json) "
                    "VALUES(?,?,?,?,?)",
                    (
                        application_id,
                        package_id,
                        row["logical_path"],
                        row["artifact_sha256"],
                        row["metadata_json"],
                    ),
                )
            connection.execute(
                "UPDATE applications SET updated_at=?,revision=revision+1 WHERE id=?",
                (created_at, application_id),
            )
            self._add_event(
                connection,
                application_id,
                "materials.packaged",
                {
                    "actor": actor,
                    "draft_id": draft["draft_id"],
                    "revision": revision,
                    "package_id": package_id,
                },
            )
        return {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "kind": "material_package",
            "package_id": package_id,
            "application_id": application_id,
            "created_at": created_at,
            "label": package_label,
            "template_revision": revision_row["template_revision"],
            "source_draft_id": draft["draft_id"],
            "source_draft_revision": revision,
            "files": list(entries.values()),
            "draft_id": draft["draft_id"],
            "draft_revision": revision,
        }

    def list_packages(self, application_id: str) -> list[dict[str, Any]]:
        self._application_row(application_id)
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT p.id,p.created_at,p.label,p.template_revision,r.application_id,r.revision,"
                "d.draft_id FROM material_packages p JOIN draft_revisions r ON r.id=p.source_draft_revision_id "
                "JOIN drafts d ON d.application_id=r.application_id "
                "WHERE p.application_id=? AND p.deleted_at IS NULL ORDER BY p.created_at",
                (application_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "package_id": row["id"],
                "created_at": row["created_at"],
                "label": row["label"],
                "template_revision": row["template_revision"],
                "source_draft_id": row["draft_id"],
                "source_draft_revision": row["revision"],
                "locked_at": row["created_at"],
                "relative_path": None,
            }
            for row in rows
        ]

    def package_files(self, application_id: str, package_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            package = connection.execute(
                "SELECT 1 FROM material_packages WHERE application_id=? AND id=? AND deleted_at IS NULL",
                (application_id, package_id),
            ).fetchone()
            if package is None:
                raise WorkspaceError(f"Unknown material package {package_id} for {application_id}")
            return [
                self._entry_from_row(row)
                for row in self._package_rows(connection, application_id, package_id)
            ]

    def package_file_path(
        self,
        application_id: str,
        package_id: str,
        relative_path: str,
    ) -> Path:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT f.artifact_sha256 FROM package_files f JOIN material_packages p "
                "ON p.application_id=f.application_id AND p.id=f.package_id "
                "WHERE f.application_id=? AND f.package_id=? AND f.logical_path=? AND p.deleted_at IS NULL",
                (application_id, package_id, relative_path),
            ).fetchone()
        if row is None:
            raise WorkspaceError(f"Unknown material-package file: {relative_path}")
        return self.objects.path_for(row["artifact_sha256"])

    def _package_path(self, application_id: str, package_id: str) -> Path:
        """Retained only to make old callers fail clearly; v2 packages are snapshots."""

        self.package_files(application_id, package_id)
        raise WorkspaceError("Storage v2 material packages do not have mutable directories")

    def package_readiness(self, application_id: str, package_id: str) -> dict[str, Any]:
        files = self.package_files(application_id, package_id)
        errors = [
            error
            for entry in files
            if (error := self.objects.verify(entry["sha256"], entry["size"]))
        ]
        deliverables = [entry for entry in files if entry.get("role") == "deliverable"]
        sources = [entry for entry in files if entry.get("role") == "content_source"]
        content = self._validate_file_map({entry["path"]: entry for entry in files})
        return {
            "integrity_ok": not errors,
            "integrity_errors": errors,
            "has_deliverables": bool(deliverables),
            "deliverables": deliverables,
            "sources": sources,
            "content": content,
            "ready_for_exact_files": bool(deliverables) and not errors,
            "ready_for_source_only": bool(sources) and not errors,
        }

    def package_is_submitted(self, application_id: str, package_id: str) -> bool:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM submissions WHERE application_id=? AND package_id=? LIMIT 1",
                (application_id, package_id),
            ).fetchone()
        return row is not None

    def delete_package(self, application_id: str, *, package_id: str) -> dict[str, Any]:
        if self.package_is_submitted(application_id, package_id):
            raise WorkspaceError(
                "A material package referenced by a submission is permanently locked"
            )
        deleted = now_iso()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT label FROM material_packages WHERE application_id=? AND id=? AND deleted_at IS NULL",
                (application_id, package_id),
            ).fetchone()
            if row is None:
                raise WorkspaceError(f"Unknown material package {package_id} for {application_id}")
            connection.execute(
                "UPDATE material_packages SET deleted_at=? WHERE application_id=? AND id=?",
                (deleted, application_id, package_id),
            )
            connection.execute(
                "UPDATE applications SET updated_at=?,revision=revision+1 WHERE id=?",
                (deleted, application_id),
            )
            self._add_event(
                connection,
                application_id,
                "materials.package-deleted",
                {"package_id": package_id, "label": row["label"], "deleted_at": deleted},
            )
        return {
            "package_id": package_id,
            "label": row["label"],
            "deleted_at": deleted,
            "trash_path": None,
        }

    def _submission_files(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        submission_id: str,
    ) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT f.logical_path,f.artifact_sha256,f.metadata_json,a.size,a.media_type "
            "FROM submission_files f JOIN artifacts a ON a.sha256=f.artifact_sha256 "
            "WHERE f.application_id=? AND f.submission_id=? ORDER BY f.logical_path",
            (application_id, submission_id),
        ).fetchall()
        return [self._entry_from_row(row) for row in rows]

    def submit(
        self,
        application_id: str,
        *,
        package_id: str | None = None,
        selected_paths: Iterable[str] | None = None,
        evidence_level: str = "exact_files",
        submitted_at: str | None = None,
        channel: str = "other",
        external_reference: str | None = None,
        note: str | None = None,
        expected_revision: int | None = None,
        created: datetime | None = None,
    ) -> dict[str, Any]:
        self._application_row(application_id)
        if evidence_level not in VALID_EVIDENCE_LEVELS:
            raise WorkspaceError(f"Unknown submission evidence level: {evidence_level}")
        if channel not in VALID_SUBMISSION_CHANNELS:
            raise WorkspaceError(f"Unknown submission channel: {channel}")
        selected = list(dict.fromkeys(selected_paths or []))
        if evidence_level == "status_only":
            if package_id or selected:
                raise WorkspaceError("A status-only submission cannot claim material files")
            package_entries: dict[str, dict[str, Any]] = {}
        else:
            if not package_id:
                package = self.lock_current_materials(
                    application_id,
                    label="投递时自动保存",
                    actor="submission",
                    expected_revision=expected_revision,
                    created=created,
                )
                package_id = package["package_id"]
            files = self.package_files(application_id, package_id)
            package_entries = {entry["path"]: entry for entry in files}
            errors = [
                error
                for entry in files
                if (error := self.objects.verify(entry["sha256"], entry["size"]))
            ]
            if errors:
                raise WorkspaceError(
                    "Material package integrity check failed: " + "; ".join(errors)
                )
            if evidence_level == "exact_files":
                if not selected:
                    raise WorkspaceError("Select the exact files that were sent")
                unknown = [path for path in selected if path not in package_entries]
                if unknown:
                    raise WorkspaceError("Unknown submitted package files: " + ", ".join(unknown))
                unsupported = [
                    path
                    for path in selected
                    if Path(path).suffix.lower() not in ALLOWED_DELIVERABLE_EXTENSIONS
                ]
                if unsupported:
                    raise WorkspaceError(
                        "Exact-file evidence accepts only PDF or DOCX deliverables: "
                        + ", ".join(unsupported)
                    )
            elif selected:
                raise WorkspaceError("Source-only submissions do not claim exact sent files")

        recorded = (
            (created or datetime.now().astimezone()).astimezone().isoformat(timespec="microseconds")
        )
        if submitted_at:
            try:
                parsed = datetime.fromisoformat(submitted_at)
                if parsed.tzinfo is None:
                    parsed = parsed.astimezone()
                submitted = parsed.astimezone().isoformat(timespec="microseconds")
            except ValueError as exc:
                raise WorkspaceError("Invalid submitted_at value") from exc
        else:
            submitted = recorded
        submission_id = timestamp_id(created)
        with self.connect() as connection:
            try:
                connection.execute(
                    "INSERT INTO submissions(id,application_id,package_id,evidence_level,submitted_at,"
                    "recorded_at,channel,external_reference,note) VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        submission_id,
                        application_id,
                        package_id,
                        evidence_level,
                        submitted,
                        recorded,
                        channel,
                        external_reference,
                        note,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise WorkspaceError(f"Submission already exists: {submission_id}") from exc
            if evidence_level == "exact_files":
                for path in selected:
                    entry = package_entries[path]
                    metadata = {
                        key: entry.get(key)
                        for key in ("role", "purpose", "origin", "media_type", "source_path")
                    }
                    connection.execute(
                        "INSERT INTO submission_files(application_id,submission_id,logical_path,artifact_sha256,metadata_json) "
                        "VALUES(?,?,?,?,?)",
                        (
                            application_id,
                            submission_id,
                            path,
                            entry["sha256"],
                            canonical_json(metadata),
                        ),
                    )
            connection.execute(
                "UPDATE applications SET status='applied',updated_at=?,revision=revision+1 WHERE id=?",
                (recorded, application_id),
            )
            submission: dict[str, Any] = {
                "schema_version": DOMAIN_SCHEMA_VERSION,
                "application_id": application_id,
                "submission_id": submission_id,
                "package_id": package_id,
                "evidence_level": evidence_level,
                "submitted_at": submitted,
                "recorded_at": recorded,
                "channel": channel,
                "external_reference": external_reference,
                "note": note,
                "selected_paths": selected,
                "files": [package_entries[path] for path in selected]
                if evidence_level == "exact_files"
                else [],
            }
            self._add_event(connection, application_id, "application.submitted", submission)
        return submission


__all__ = ["PackageStorageMixin"]
