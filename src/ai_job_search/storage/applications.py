"""Application identities, status transitions, and event history."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, cast

from ..markdown_contract import TEMPLATE_REVISION
from .common import (
    DEFAULT_STATUS,
    DOMAIN_SCHEMA_VERSION,
    VALID_STATUSES,
    WorkspaceError,
    canonical_json,
    now_iso,
    slugify,
)
from .database import StorageDatabase


class ApplicationStorageMixin(StorageDatabase):
    """Persist applications and their append-only status events."""

    @staticmethod
    def _add_event(
        connection: sqlite3.Connection,
        application_id: str,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        connection.execute(
            "INSERT INTO application_events(application_id,event_type,created_at,data_json) VALUES(?,?,?,?)",
            (application_id, event_type, now_iso(), canonical_json(data)),
        )

    def _application_row(self, application_id: str) -> sqlite3.Row:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM applications WHERE id=?", (application_id,)
            ).fetchone()
        if row is None:
            raise WorkspaceError(f"Unknown application: {application_id}")
        return cast(sqlite3.Row, row)

    def application_path(self, application_id: str) -> Path:
        """Compatibility helper; v2 applications do not own mutable directories."""

        self._application_row(application_id)
        return self.root

    def create_application(
        self,
        *,
        company: str,
        role: str,
        source: str | Path | None = None,
        job_url: str | None = None,
        source_job_id: str | None = None,
        created_at: str | None = None,
        application_id: str | None = None,
    ) -> dict[str, Any]:
        self.require_initialized()
        company = company.strip()
        role = role.strip()
        if not company or not role:
            raise WorkspaceError("Company and role must not be empty")
        created = created_at or now_iso()
        date_part = created[:10]
        base_id = application_id or f"{date_part}-{slugify(company)}-{slugify(role)}"

        source_digest: str | None = None
        source_size = 0
        source_path: Path | None = None
        if source is not None:
            source_path = Path(source).expanduser().resolve()
            source_digest, source_size, _ = self.objects.put_file(source_path)

        with self.connect() as connection:
            if (
                source_job_id is not None
                and connection.execute("SELECT 1 FROM jobs WHERE id=?", (source_job_id,)).fetchone()
                is None
            ):
                raise WorkspaceError(f"Unknown discovered job: {source_job_id}")
            chosen = base_id
            sequence = 2
            while connection.execute("SELECT 1 FROM applications WHERE id=?", (chosen,)).fetchone():
                if application_id:
                    raise WorkspaceError(f"Application already exists: {application_id}")
                chosen = f"{base_id}-{sequence}"
                sequence += 1
            if source_digest and source_path:
                self._register_artifact(
                    connection,
                    source_digest,
                    source_size,
                    self._media_type(source_path),
                    source_path.name,
                )
            connection.execute(
                "INSERT INTO applications(id,company,role,status,created_at,updated_at,job_url,"
                "source_job_id,source_artifact_sha256,revision) VALUES(?,?,?,?,?,?,?,?,?,0)",
                (
                    chosen,
                    company,
                    role,
                    DEFAULT_STATUS,
                    created,
                    created,
                    job_url,
                    source_job_id,
                    source_digest,
                ),
            )
            draft_id = f"{chosen}-draft"
            connection.execute(
                "INSERT INTO drafts(application_id,draft_id,current_revision,status,created_at,updated_at) "
                "VALUES(?,?,0,'empty',?,?)",
                (chosen, draft_id, created, created),
            )
            empty_validation = self._validate_file_map({})
            connection.execute(
                "INSERT INTO draft_revisions(application_id,revision,base_package_id,label,"
                "template_revision,validation_json,created_at,actor) VALUES(?,0,NULL,NULL,?,?,?,?)",
                (chosen, TEMPLATE_REVISION, canonical_json(empty_validation), created, "system"),
            )
            record: dict[str, Any] = {
                "schema_version": DOMAIN_SCHEMA_VERSION,
                "id": chosen,
                "company": company,
                "role": role,
                "status": DEFAULT_STATUS,
                "created_at": created,
                "updated_at": created,
                "source": self._artifact_relative_path(source_digest) if source_digest else None,
                "job_url": job_url,
                "source_job_id": source_job_id,
            }
            self._add_event(connection, chosen, "application.created", record)
        return {**record, "draft": self.show_draft(chosen)["summary"]}

    def create_application_from_job(self, job_id: str) -> dict[str, Any]:
        job = self.show_job(job_id)
        with self.connect() as connection:
            existing = connection.execute(
                "SELECT id FROM applications WHERE source_job_id=?", (job_id,)
            ).fetchone()
            version = connection.execute(
                "SELECT source_artifact_sha256 FROM job_versions WHERE id=?",
                (job["version_id"],),
            ).fetchone()
        if existing:
            raise WorkspaceError(f"Job already has application: {existing['id']}")
        if version is None:
            raise WorkspaceError(f"Missing current job version: {job_id}")
        record = self.create_application(
            company=job.get("company") or "Unknown company",
            role=job["title"],
            job_url=job["url"],
            source_job_id=job_id,
        )
        with self.connect() as connection:
            connection.execute(
                "UPDATE applications SET source_artifact_sha256=? WHERE id=?",
                (version["source_artifact_sha256"], record["id"]),
            )
            connection.execute("UPDATE jobs SET status='applied' WHERE id=?", (job_id,))
            self._add_event(
                connection,
                record["id"],
                "discovered-job.linked",
                {"job_id": job_id, "portal": job["portal"], "url": job["url"]},
            )
        record["source"] = self._artifact_relative_path(version["source_artifact_sha256"])
        return record

    def application_for_job(self, job_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id,company,role,status,created_at,updated_at,job_url,source_job_id "
                "FROM applications WHERE source_job_id=?",
                (job_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_applications(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT a.id,a.company,a.role,a.status,a.created_at,a.updated_at,a.job_url,"
                "d.status AS draft_status,d.current_revision AS draft_revision "
                "FROM applications a JOIN drafts d ON d.application_id=a.id "
                "ORDER BY a.created_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def show_application(self, application_id: str) -> dict[str, Any]:
        row = self._application_row(application_id)
        record: dict[str, Any] = {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "id": row["id"],
            "company": row["company"],
            "role": row["role"],
            "status": row["status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "job_url": row["job_url"],
            "source_job_id": row["source_job_id"],
            "source": self._artifact_relative_path(row["source_artifact_sha256"])
            if row["source_artifact_sha256"]
            else None,
            "draft": self.show_draft(application_id)["summary"],
            "packages": self.list_packages(application_id),
        }
        with self.connect() as connection:
            submission_rows = connection.execute(
                "SELECT * FROM submissions WHERE application_id=? ORDER BY recorded_at",
                (application_id,),
            ).fetchall()
            record["submissions"] = []
            for submission_row in submission_rows:
                submission = dict(submission_row)
                submission["files"] = self._submission_files(
                    connection, application_id, submission["id"]
                )
                record["submissions"].append(submission)
            record["events"] = [
                {
                    "type": event["event_type"],
                    "created_at": event["created_at"],
                    "data": json.loads(event["data_json"]),
                }
                for event in connection.execute(
                    "SELECT event_type,created_at,data_json FROM application_events "
                    "WHERE application_id=? ORDER BY id",
                    (application_id,),
                ).fetchall()
            ]
        return record

    def update_status(
        self,
        application_id: str,
        *,
        status: str,
        note: str | None = None,
    ) -> dict[str, Any]:
        if status not in VALID_STATUSES:
            raise WorkspaceError(
                f"Invalid status {status!r}; expected one of: {', '.join(sorted(VALID_STATUSES))}"
            )
        if status == "applied":
            raise WorkspaceError("请通过“记录已完成的投递”进入已投递阶段")
        updated = now_iso()
        with self.connect() as connection:
            result = connection.execute(
                "UPDATE applications SET status=?,updated_at=?,revision=revision+1 WHERE id=?",
                (status, updated, application_id),
            )
            if result.rowcount != 1:
                raise WorkspaceError(f"Unknown application: {application_id}")
            self._add_event(
                connection,
                application_id,
                "status.changed",
                {"status": status, "note": note},
            )
        return {"application_id": application_id, "status": status, "updated_at": updated}


__all__ = ["ApplicationStorageMixin"]
