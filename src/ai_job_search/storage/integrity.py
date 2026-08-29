"""Read-only integrity audit, garbage collection, and workspace export."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from .common import (
    DOMAIN_SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
    json_hash,
    json_write,
    now_iso,
    timestamp_id,
)
from .database import StorageDatabase


class IntegrityStorageMixin(StorageDatabase):
    """Verify all metadata/object relationships without changing live records."""

    def _referenced_artifacts(self, connection: sqlite3.Connection) -> set[str]:
        references: set[str] = set()
        queries = (
            "SELECT source_artifact_sha256 AS sha256 FROM job_versions",
            "SELECT source_artifact_sha256 AS sha256 FROM applications WHERE source_artifact_sha256 IS NOT NULL",
            "SELECT artifact_sha256 AS sha256 FROM draft_revision_files",
            "SELECT artifact_sha256 AS sha256 FROM package_files",
            "SELECT artifact_sha256 AS sha256 FROM submission_files",
        )
        for query in queries:
            references.update(row["sha256"] for row in connection.execute(query).fetchall())
        return references

    def audit(self) -> dict[str, Any]:
        self.require_initialized()
        errors: list[str] = []
        with self.connect() as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                errors.append(f"sqlite integrity: {integrity}")
            errors.extend(
                f"foreign key violation {tuple(row)}"
                for row in connection.execute("PRAGMA foreign_key_check").fetchall()
            )
            artifacts = connection.execute(
                "SELECT sha256,size FROM artifacts ORDER BY sha256"
            ).fetchall()
            for table in ("profile_versions", "preference_versions"):
                for row in connection.execute(
                    f"SELECT id,payload_json,payload_sha256 FROM {table}"
                ).fetchall():
                    try:
                        actual = json_hash(json.loads(row["payload_json"]))
                    except json.JSONDecodeError:
                        errors.append(f"invalid JSON {table} {row['id']}")
                        continue
                    if actual != row["payload_sha256"]:
                        errors.append(f"payload hash mismatch {table} {row['id']}")
            for row in connection.execute(
                "SELECT id,normalized_json,normalized_sha256 FROM job_versions"
            ).fetchall():
                try:
                    actual = json_hash(json.loads(row["normalized_json"]))
                except json.JSONDecodeError:
                    errors.append(f"invalid JSON job_versions {row['id']}")
                    continue
                if actual != row["normalized_sha256"]:
                    errors.append(f"payload hash mismatch job_versions {row['id']}")
            for row in connection.execute(
                "SELECT d.application_id,d.current_revision FROM drafts d "
                "LEFT JOIN draft_revisions r ON r.application_id=d.application_id "
                "AND r.revision=d.current_revision WHERE r.id IS NULL"
            ).fetchall():
                errors.append(
                    f"draft current revision missing {row['application_id']}/{row['current_revision']}"
                )
            for row in connection.execute(
                "SELECT p.application_id,p.id,r.application_id AS revision_application "
                "FROM material_packages p JOIN draft_revisions r ON r.id=p.source_draft_revision_id "
                "WHERE p.application_id<>r.application_id"
            ).fetchall():
                errors.append(f"package draft owner mismatch {row['application_id']}/{row['id']}")
            for row in connection.execute(
                "SELECT p.application_id,p.id FROM material_packages p "
                "JOIN submissions s ON s.application_id=p.application_id AND s.package_id=p.id "
                "WHERE p.deleted_at IS NOT NULL"
            ).fetchall():
                errors.append(f"submitted package is deleted {row['application_id']}/{row['id']}")
            submission_rows = connection.execute("SELECT * FROM submissions").fetchall()
            for submission in submission_rows:
                file_rows = connection.execute(
                    "SELECT logical_path,artifact_sha256 FROM submission_files "
                    "WHERE application_id=? AND submission_id=?",
                    (submission["application_id"], submission["id"]),
                ).fetchall()
                if submission["evidence_level"] == "status_only":
                    if submission["package_id"] is not None or file_rows:
                        errors.append(
                            f"status-only submission claims materials {submission['application_id']}/{submission['id']}"
                        )
                elif submission["package_id"] is None:
                    errors.append(
                        f"material submission has no package {submission['application_id']}/{submission['id']}"
                    )
                elif submission["evidence_level"] == "source_only" and file_rows:
                    errors.append(
                        f"source-only submission claims exact files {submission['application_id']}/{submission['id']}"
                    )
                elif submission["evidence_level"] == "exact_files":
                    if not file_rows:
                        errors.append(
                            f"exact-file submission has no files {submission['application_id']}/{submission['id']}"
                        )
                    for file_row in file_rows:
                        package_file = connection.execute(
                            "SELECT artifact_sha256 FROM package_files WHERE application_id=? "
                            "AND package_id=? AND logical_path=?",
                            (
                                submission["application_id"],
                                submission["package_id"],
                                file_row["logical_path"],
                            ),
                        ).fetchone()
                        if (
                            package_file is None
                            or package_file["artifact_sha256"] != file_row["artifact_sha256"]
                        ):
                            errors.append(
                                f"submission file differs from package {submission['application_id']}/"
                                f"{submission['id']}/{file_row['logical_path']}"
                            )
            referenced = self._referenced_artifacts(connection)
            known = {row["sha256"] for row in artifacts}
            missing_metadata = referenced - known
            errors.extend(
                f"referenced object has no metadata {digest}" for digest in sorted(missing_metadata)
            )
            checked_drafts = connection.execute("SELECT COUNT(*) FROM drafts").fetchone()[0]
            checked_packages = connection.execute(
                "SELECT COUNT(*) FROM material_packages"
            ).fetchone()[0]
            checked_submissions = connection.execute("SELECT COUNT(*) FROM submissions").fetchone()[
                0
            ]
            failed_operations = connection.execute(
                "SELECT COUNT(*) FROM operations WHERE status='failed'"
            ).fetchone()[0]
            pending_operations = connection.execute(
                "SELECT COUNT(*) FROM operations WHERE status='pending'"
            ).fetchone()[0]
        for artifact in artifacts:
            error = self.objects.verify(artifact["sha256"], int(artifact["size"]))
            if error:
                errors.append(error)
        disk_objects = {
            path.parent.name + path.name
            for path in self.objects.root.glob("*/*")
            if path.is_file() and len(path.parent.name + path.name) == 64
        }
        orphan_objects = sorted(disk_objects - known)
        return {
            "ok": not errors,
            "storage_schema_version": STORAGE_SCHEMA_VERSION,
            "sqlite_integrity": integrity,
            "checked_artifacts": len(artifacts),
            "checked_drafts": checked_drafts,
            "checked_packages": checked_packages,
            "checked_submissions": checked_submissions,
            "orphan_objects": orphan_objects,
            "failed_operations": failed_operations,
            "pending_operations": pending_operations,
            "errors": errors,
        }

    def garbage_collect(self, *, dry_run: bool = True) -> dict[str, Any]:
        with self.connect() as connection:
            referenced = self._referenced_artifacts(connection)
            known_rows = connection.execute("SELECT sha256 FROM artifacts").fetchall()
            known = {row["sha256"] for row in known_rows}
        disk_objects = {
            path.parent.name + path.name
            for path in self.objects.root.glob("*/*")
            if path.is_file() and len(path.parent.name + path.name) == 64
        }
        candidates = sorted((known | disk_objects) - referenced)
        removed: list[str] = []
        if not dry_run:
            trash_root = self.root / "trash" / "objects" / timestamp_id()
            with self.connect() as connection:
                for digest in candidates:
                    path = self.objects.path_for(digest)
                    if path.exists():
                        destination = trash_root / digest[:2] / digest[2:]
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        path.replace(destination)
                    if digest in known:
                        connection.execute("DELETE FROM artifacts WHERE sha256=?", (digest,))
                    removed.append(digest)
        return {"dry_run": dry_run, "candidates": candidates, "removed": removed}

    def export_summary(self) -> dict[str, Any]:
        self.require_initialized()
        exported = now_iso()
        payload: dict[str, Any] = {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "storage_schema_version": STORAGE_SCHEMA_VERSION,
            "exported_at": exported,
            "profile": self.show_candidate_profile(),
            "preferences": self.show_preferences(),
            "jobs": [self.show_job(job["id"]) for job in self.list_jobs()],
            "applications": [
                self.show_application(item["id"]) for item in self.list_applications()
            ],
        }
        output = self.root / "exports" / f"workspace-{timestamp_id()}.json"
        json_write(output, payload, overwrite=False)
        return {
            "path": str(output),
            "applications": len(payload["applications"]),
            "jobs": len(payload["jobs"]),
        }


__all__ = ["IntegrityStorageMixin"]
