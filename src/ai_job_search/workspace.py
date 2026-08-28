from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import tempfile
import unicodedata
from urllib.parse import urlsplit, urlunsplit
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from .markdown_contract import (
    REQUIRED_DOCUMENTS,
    TEMPLATE_REVISION,
    validate_application_documents,
)
from .job_contract import (
    JobContractError,
    validate_job_semantics,
    validate_job_shape,
)

SCHEMA_VERSION = 2
DEFAULT_STATUS = "draft"
DEFAULT_DRAFT_STATUS = "empty"
VALID_DRAFT_STATUSES = {"empty", "working"}
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
VALID_JOB_RECOMMENDATIONS = {"pursue", "consider", "skip"}
VALID_EVALUATION_CONFIDENCE = {"high", "medium", "low"}
VALID_CONSTRAINT_RESULTS = {"pass", "fail", "unclear"}
VALID_ARTIFACT_ROLES = {
    "content_source",
    "editable_source",
    "deliverable",
    "supporting",
}
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
VALID_EVIDENCE_LEVELS = {"exact_files", "source_only", "status_only"}
VALID_SUBMISSION_CHANNELS = {
    "company_portal",
    "email",
    "recruiting_agent",
    "linkedin",
    "other",
}
ALLOWED_DELIVERABLE_EXTENSIONS = {".pdf", ".docx"}
MAX_DELIVERABLE_BYTES = 20 * 1024 * 1024

class WorkspaceError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="microseconds")


def timestamp_id(value: datetime | None = None) -> str:
    current = (value or datetime.now().astimezone()).astimezone()
    return current.strftime("%Y-%m-%dT%H%M%S.%f%z")


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip().lower()
    slug = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE).strip("-_")
    slug = re.sub(r"[-_]{2,}", "-", slug)
    if not slug:
        slug = "item-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]
    return slug[:64].rstrip("-")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_write(path: Path, data: Any, *, overwrite: bool = True) -> None:
    if path.exists() and not overwrite:
        raise WorkspaceError(f"Refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _json_read(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkspaceError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkspaceError(f"Invalid JSON in {path}: {exc}") from exc


class Workspace:
    def __init__(self, root: str | Path = ".job-search") -> None:
        self.root = Path(root).expanduser().resolve()
        self.db_path = self.root / "index.sqlite3"

    def initialize(self) -> dict[str, Any]:
        self.root.mkdir(parents=True, exist_ok=True)
        for relative in (
            "profile",
            "applications",
            "interview",
            "exports",
            "cache",
            "trash",
        ):
            (self.root / relative).mkdir(exist_ok=True)

        workspace_file = self.root / "workspace.json"
        if not workspace_file.exists():
            _json_write(
                workspace_file,
                {
                    "schema_version": SCHEMA_VERSION,
                    "created_at": now_iso(),
                    "description": "Private AI job-search workspace",
                },
                overwrite=False,
            )

        candidate_file = self.root / "profile" / "candidate.json"
        if not candidate_file.exists():
            _json_write(
                candidate_file,
                {
                    "schema_version": SCHEMA_VERSION,
                    "identity": {},
                    "contact": {},
                    "summary": "",
                    "experience": [],
                    "education": [],
                    "skills": [],
                    "languages": [],
                    "evidence": [],
                },
                overwrite=False,
            )

        preferences_file = self.root / "profile" / "preferences.json"
        if not preferences_file.exists():
            _json_write(
                preferences_file,
                {
                    "schema_version": SCHEMA_VERSION,
                    "target_roles": [],
                    "target_domains": [],
                    "locations": [],
                    "work_style": {},
                    "compensation": {},
                    "hard_constraints": [],
                    "soft_preferences": [],
                },
                overwrite=False,
            )

        with self.connect(require_initialized=False) as connection:
            self._create_schema(connection)
        return {"workspace": str(self.root), "initialized": True}

    def require_initialized(self) -> None:
        if not (self.root / "workspace.json").is_file() or not self.db_path.is_file():
            raise WorkspaceError(
                f"Workspace is not initialized at {self.root}. Run `job-search init`."
            )

    @contextmanager
    def connect(self, *, require_initialized: bool = True):
        if require_initialized:
            self.require_initialized()
        self.root.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _create_schema(connection: sqlite3.Connection) -> None:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS applications (
                id TEXT PRIMARY KEY,
                company TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                relative_path TEXT NOT NULL UNIQUE,
                job_url TEXT,
                source_job_id TEXT
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                portal TEXT NOT NULL,
                external_id TEXT,
                title TEXT NOT NULL,
                company TEXT,
                location TEXT,
                url TEXT NOT NULL,
                posted_at TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                raw_json TEXT NOT NULL,
                rating INTEGER,
                notes TEXT NOT NULL DEFAULT '',
                UNIQUE (portal, url)
            );
            CREATE TABLE IF NOT EXISTS material_packages (
                id TEXT NOT NULL,
                application_id TEXT NOT NULL REFERENCES applications(id),
                created_at TEXT NOT NULL,
                relative_path TEXT NOT NULL UNIQUE,
                label TEXT,
                PRIMARY KEY (application_id, id)
            );
            CREATE TABLE IF NOT EXISTS drafts (
                application_id TEXT PRIMARY KEY REFERENCES applications(id),
                draft_id TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL,
                revision INTEGER NOT NULL,
                base_package_id TEXT,
                relative_path TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT NOT NULL,
                application_id TEXT NOT NULL,
                package_id TEXT,
                evidence_level TEXT NOT NULL,
                submitted_at TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                channel TEXT NOT NULL,
                external_reference TEXT,
                note TEXT,
                relative_path TEXT NOT NULL UNIQUE,
                PRIMARY KEY (application_id, id),
                FOREIGN KEY (application_id, package_id)
                  REFERENCES material_packages(application_id, id)
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id TEXT NOT NULL REFERENCES applications(id),
                event_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                data_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS job_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL REFERENCES jobs(id),
                analyzed_at TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                profile_sha256 TEXT NOT NULL,
                preferences_sha256 TEXT NOT NULL,
                job_sha256 TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_applications_status
              ON applications(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_status
              ON jobs(status, last_seen_at);
            CREATE INDEX IF NOT EXISTS idx_events_application
              ON events(application_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_drafts_status
              ON drafts(status, updated_at);
            CREATE INDEX IF NOT EXISTS idx_job_evaluations_latest
              ON job_evaluations(job_id, id DESC);
            """)
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(applications)")
        }
        if "source_job_id" not in columns:
            connection.execute("ALTER TABLE applications ADD COLUMN source_job_id TEXT")
        job_columns = {row[1] for row in connection.execute("PRAGMA table_info(jobs)")}
        if "rating" not in job_columns:
            connection.execute("ALTER TABLE jobs ADD COLUMN rating INTEGER")
        if "notes" not in job_columns:
            connection.execute(
                "ALTER TABLE jobs ADD COLUMN notes TEXT NOT NULL DEFAULT ''"
            )
        connection.execute(
            "UPDATE jobs SET status = 'applied' "
            "WHERE id IN ("
            "SELECT source_job_id FROM applications WHERE source_job_id IS NOT NULL"
            ")"
        )

    def _relative(self, path: Path) -> str:
        resolved = path.resolve()
        try:
            return resolved.relative_to(self.root).as_posix()
        except ValueError as exc:
            raise WorkspaceError(f"Path escapes the private workspace: {path}") from exc

    def _application_row(self, application_id: str) -> sqlite3.Row:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM applications WHERE id = ?", (application_id,)
            ).fetchone()
        if row is None:
            raise WorkspaceError(f"Unknown application: {application_id}")
        return row

    def application_path(self, application_id: str) -> Path:
        row = self._application_row(application_id)
        path = (self.root / row["relative_path"]).resolve()
        self._relative(path)
        return path

    def create_application(
        self,
        *,
        company: str,
        role: str,
        source: str | Path | None = None,
        job_url: str | None = None,
        source_job_id: str | None = None,
    ) -> dict[str, Any]:
        self.require_initialized()
        company = company.strip()
        role = role.strip()
        if not company or not role:
            raise WorkspaceError("Company and role must not be empty")

        created_at = now_iso()
        date_part = created_at[:10]
        base_id = f"{date_part}-{slugify(company)}-{slugify(role)}"
        application_id = base_id
        with self.connect() as connection:
            sequence = 2
            while connection.execute(
                "SELECT 1 FROM applications WHERE id = ?", (application_id,)
            ).fetchone():
                application_id = f"{base_id}-{sequence}"
                sequence += 1

            app_path = self.root / "applications" / date_part[:4] / application_id
            if app_path.exists():
                raise WorkspaceError(
                    f"Application directory already exists: {app_path}"
                )
            (app_path / "source").mkdir(parents=True)
            (app_path / "draft").mkdir()
            (app_path / "packages").mkdir()
            (app_path / "submitted").mkdir()
            (app_path / "interview").mkdir()

            source_relative: str | None = None
            if source is not None:
                source_path = Path(source).expanduser().resolve()
                if not source_path.is_file():
                    raise WorkspaceError(
                        f"Job posting source is not a file: {source_path}"
                    )
                suffix = source_path.suffix.lower() or ".txt"
                destination = app_path / "source" / f"posting{suffix}"
                shutil.copy2(source_path, destination)
                source_relative = self._relative(destination)

            draft_id = f"{application_id}-draft"
            draft_manifest = self._empty_draft_manifest(
                application_id,
                draft_id=draft_id,
                created_at=created_at,
                relative_path=self._relative(app_path / "draft"),
            )
            _json_write(
                app_path / "draft" / "manifest.json", draft_manifest, overwrite=False
            )
            record = {
                "schema_version": SCHEMA_VERSION,
                "id": application_id,
                "company": company,
                "role": role,
                "status": DEFAULT_STATUS,
                "created_at": created_at,
                "updated_at": created_at,
                "source": source_relative,
                "job_url": job_url,
                "source_job_id": source_job_id,
                "draft": self._draft_summary(draft_manifest),
            }
            _json_write(app_path / "application.json", record, overwrite=False)
            relative_path = self._relative(app_path)
            connection.execute(
                """
                INSERT INTO applications
                  (id, company, role, status, created_at, updated_at, relative_path, job_url, source_job_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    application_id,
                    company,
                    role,
                    DEFAULT_STATUS,
                    created_at,
                    created_at,
                    relative_path,
                    job_url,
                    source_job_id,
                ),
            )
            connection.execute(
                """
                INSERT INTO drafts
                  (application_id, draft_id, status, revision, base_package_id,
                   relative_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    application_id,
                    draft_id,
                    draft_manifest["status"],
                    draft_manifest["revision"],
                    draft_manifest["base_package_id"],
                    draft_manifest["relative_path"],
                    created_at,
                    created_at,
                ),
            )
            self._add_event(connection, application_id, "application.created", record)
        return record

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

    def describe_job_evidence(
        self,
        *,
        portal: str,
        url: str,
        snapshot: str | Path,
        retriever: str | None = None,
    ) -> dict[str, Any]:
        """Build trusted provenance metadata for a CLI-fetched page snapshot."""
        self.require_initialized()
        provider = slugify(portal)
        detail_url = self._canonical_url(url)
        snapshot_path = Path(snapshot).expanduser().resolve()
        cache_root = (self.root / "cache").resolve()
        try:
            snapshot_path.relative_to(cache_root)
        except ValueError as exc:
            raise WorkspaceError(
                f"Job evidence snapshot must be under {cache_root}: {snapshot_path}"
            ) from exc
        if not snapshot_path.is_file():
            raise WorkspaceError(f"Job evidence snapshot is not a file: {snapshot_path}")
        source = {
            "provider": provider,
            "detail_url": detail_url,
            "retrieved_at": now_iso(),
            "snapshot_path": self._relative(snapshot_path),
            "snapshot_sha256": sha256_file(snapshot_path),
        }
        if retriever is not None:
            retriever = retriever.strip()
            if not retriever:
                raise WorkspaceError("Job evidence retriever cannot be blank")
            source["retriever"] = retriever
        return source

    def import_jobs(
        self,
        *,
        portal: str,
        source_file: str | Path,
        validate_only: bool = False,
    ) -> dict[str, Any]:
        self.require_initialized()
        portal = slugify(portal)
        source = Path(source_file).expanduser().resolve()
        payload = _json_read(source)
        if isinstance(payload, list):
            results = payload
        elif isinstance(payload, dict):
            results = [payload]
        else:
            raise WorkspaceError(
                "Normalized job import JSON must be one object or a list of objects"
            )
        if not results:
            raise WorkspaceError("Normalized job import must contain at least one job")

        prepared: list[dict[str, Any]] = []
        identities: set[tuple[str, str]] = set()
        for index, raw in enumerate(results):
            try:
                validate_job_shape(raw)
                url = self._canonical_url(raw["url"])
                detail_url = self._canonical_url(raw["source"]["detail_url"])
                validate_job_semantics(
                    raw,
                    portal=portal,
                    workspace_root=self.root,
                    canonical_url=url,
                    canonical_detail_url=detail_url,
                )
            except (JobContractError, WorkspaceError) as exc:
                raise WorkspaceError(f"Job import item {index}: {exc}") from exc
            external_id = raw.get("external_id")
            identity = (portal, external_id or url)
            if identity in identities:
                raise WorkspaceError(
                    f"Job import item {index}: duplicate listing identity in the same batch"
                )
            identities.add(identity)
            prepared.append(
                {
                    "raw": raw,
                    "url": url,
                    "external_id": external_id,
                    "title": raw["title"].strip(),
                    "company": raw.get("company"),
                    "location": raw.get("location"),
                    "posted_at": raw.get("posted_at"),
                }
            )

        if validate_only:
            return {
                "portal": portal,
                "valid": True,
                "jobs": len(prepared),
                "source_file": str(source),
            }

        imported = 0
        updated = 0
        seen_at = now_iso()
        with self.connect() as connection:
            for item in prepared:
                raw = item["raw"]
                title = item["title"]
                url = item["url"]
                external_id = item["external_id"]
                stable_source = f"{portal}\0{external_id or url}"
                job_id = f"{portal}-{hashlib.sha256(stable_source.encode('utf-8')).hexdigest()[:16]}"
                existing = connection.execute(
                    """
                    SELECT id FROM jobs
                    WHERE portal = ? AND (url = ? OR (? IS NOT NULL AND external_id = ?))
                    """,
                    (portal, url, external_id, external_id),
                ).fetchone()
                raw_json = json.dumps(raw, ensure_ascii=False, sort_keys=True)
                if existing:
                    connection.execute(
                        """
                        UPDATE jobs SET external_id = ?, title = ?, company = ?, location = ?,
                          url = ?, posted_at = ?, last_seen_at = ?, raw_json = ? WHERE id = ?
                        """,
                        (
                            external_id,
                            title,
                            item["company"],
                            item["location"],
                            url,
                            item["posted_at"],
                            seen_at,
                            raw_json,
                            existing["id"],
                        ),
                    )
                    updated += 1
                else:
                    connection.execute(
                        """
                        INSERT INTO jobs
                          (id, portal, external_id, title, company, location, url,
                           posted_at, status, first_seen_at, last_seen_at, raw_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
                        """,
                        (
                            job_id,
                            portal,
                            external_id,
                            title,
                            item["company"],
                            item["location"],
                            url,
                            item["posted_at"],
                            seen_at,
                            seen_at,
                            raw_json,
                        ),
                    )
                    imported += 1
        return {
            "portal": portal,
            "imported": imported,
            "updated": updated,
            "skipped": 0,
        }

    def list_jobs(self, *, status: str | None = None) -> list[dict[str, Any]]:
        self.require_initialized()
        query = (
            "SELECT id, portal, external_id, title, company, location, url, posted_at, "
            "status, first_seen_at, last_seen_at FROM jobs"
        )
        parameters: tuple[Any, ...] = ()
        if status:
            query += " WHERE status = ?"
            parameters = (status,)
        query += " ORDER BY last_seen_at DESC, id"
        with self.connect() as connection:
            return [
                dict(row) for row in connection.execute(query, parameters).fetchall()
            ]

    def list_jobs_for_dashboard(self) -> list[dict[str, Any]]:
        """Return job rows with raw salary data and the latest AI recommendation."""
        self.require_initialized()
        query = """
            SELECT
                j.id, j.portal, j.external_id, j.title, j.company, j.location,
                j.url, j.posted_at, j.status, j.rating, j.first_seen_at, j.last_seen_at,
                j.raw_json,
                (
                    SELECT application.status
                    FROM applications AS application
                    WHERE application.source_job_id = j.id
                    ORDER BY application.created_at
                    LIMIT 1
                ) AS application_status,
                evaluation.payload_json AS evaluation_json,
                evaluation.analyzed_at AS evaluation_analyzed_at
            FROM jobs AS j
            LEFT JOIN job_evaluations AS evaluation
              ON evaluation.id = (
                SELECT latest.id
                FROM job_evaluations AS latest
                WHERE latest.job_id = j.id
                ORDER BY latest.id DESC
                LIMIT 1
              )
            ORDER BY j.last_seen_at DESC, j.id
        """
        with self.connect() as connection:
            rows = connection.execute(query).fetchall()
        result: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["raw"] = json.loads(item.pop("raw_json"))
            evaluation_json = item.pop("evaluation_json")
            item["evaluation"] = (
                json.loads(evaluation_json) if evaluation_json is not None else None
            )
            result.append(item)
        return result

    def show_job(self, job_id: str) -> dict[str, Any]:
        """Return one normalized discovered job together with its private raw payload."""
        self.require_initialized()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
        if row is None:
            raise WorkspaceError(f"Unknown discovered job: {job_id}")
        result = dict(row)
        result["raw"] = json.loads(result.pop("raw_json"))
        return result

    @staticmethod
    def _validate_job_evaluation(evaluation: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(evaluation, dict):
            raise WorkspaceError("Job evaluation must be a JSON object")
        if evaluation.get("schema_version") != SCHEMA_VERSION:
            raise WorkspaceError(
                f"Job evaluation schema_version must be {SCHEMA_VERSION}"
            )

        recommendation = evaluation.get("recommendation")
        if recommendation not in VALID_JOB_RECOMMENDATIONS:
            allowed = ", ".join(sorted(VALID_JOB_RECOMMENDATIONS))
            raise WorkspaceError(
                f"Job evaluation recommendation must be one of: {allowed}"
            )
        summary = evaluation.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            raise WorkspaceError("Job evaluation summary must be a non-empty string")

        for key in ("strengths", "questions"):
            values = evaluation.get(key)
            if not isinstance(values, list) or any(
                not isinstance(item, str) or not item.strip() for item in values
            ):
                raise WorkspaceError(f"Job evaluation {key} must be a list of strings")

        gaps = evaluation.get("gaps")
        if not isinstance(gaps, dict):
            raise WorkspaceError("Job evaluation gaps must be an object")
        for key in ("disqualifying", "learnable", "unclear"):
            values = gaps.get(key)
            if not isinstance(values, list) or any(
                not isinstance(item, str) or not item.strip() for item in values
            ):
                raise WorkspaceError(
                    f"Job evaluation gaps.{key} must be a list of strings"
                )

        constraints = evaluation.get("hard_constraints")
        if not isinstance(constraints, dict):
            raise WorkspaceError("Job evaluation hard_constraints must be an object")
        if constraints.get("result") not in VALID_CONSTRAINT_RESULTS:
            allowed = ", ".join(sorted(VALID_CONSTRAINT_RESULTS))
            raise WorkspaceError(f"hard_constraints.result must be one of: {allowed}")
        reasons = constraints.get("reasons")
        if not isinstance(reasons, list) or any(
            not isinstance(item, str) or not item.strip() for item in reasons
        ):
            raise WorkspaceError("hard_constraints.reasons must be a list of strings")

        confidence = evaluation.get("confidence")
        if confidence not in VALID_EVALUATION_CONFIDENCE:
            allowed = ", ".join(sorted(VALID_EVALUATION_CONFIDENCE))
            raise WorkspaceError(f"Job evaluation confidence must be one of: {allowed}")
        source_limitations = evaluation.get("source_limitations")
        if not isinstance(source_limitations, str):
            raise WorkspaceError("Job evaluation source_limitations must be a string")

        return {
            "schema_version": SCHEMA_VERSION,
            "recommendation": recommendation,
            "summary": summary.strip(),
            "strengths": [item.strip() for item in evaluation["strengths"]],
            "gaps": {
                key: [item.strip() for item in gaps[key]]
                for key in ("disqualifying", "learnable", "unclear")
            },
            "questions": [item.strip() for item in evaluation["questions"]],
            "hard_constraints": {
                "result": constraints["result"],
                "reasons": [item.strip() for item in reasons],
            },
            "confidence": confidence,
            "source_limitations": source_limitations.strip(),
        }

    @staticmethod
    def _job_sha256(job: dict[str, Any]) -> str:
        relevant = {
            key: job.get(key)
            for key in (
                "id",
                "portal",
                "external_id",
                "title",
                "company",
                "location",
                "url",
                "posted_at",
                "raw",
            )
        }
        encoded = json.dumps(
            relevant, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def record_job_evaluation(
        self,
        job_id: str,
        evaluation: dict[str, Any],
        *,
        analyzed_at: str | None = None,
    ) -> dict[str, Any]:
        """Append one AI-authored evaluation and retain its source-state hashes."""
        job = self.show_job(job_id)
        normalized = self._validate_job_evaluation(evaluation)
        timestamp = analyzed_at or now_iso()
        profile_sha256 = sha256_file(self.root / "profile" / "candidate.json")
        preferences_sha256 = sha256_file(self.root / "profile" / "preferences.json")
        job_sha256 = self._job_sha256(job)
        with self.connect() as connection:
            cursor = connection.execute(
                "INSERT INTO job_evaluations "
                "(job_id, analyzed_at, recommendation, payload_json, profile_sha256, "
                "preferences_sha256, job_sha256) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    job_id,
                    timestamp,
                    normalized["recommendation"],
                    json.dumps(normalized, ensure_ascii=False, sort_keys=True),
                    profile_sha256,
                    preferences_sha256,
                    job_sha256,
                ),
            )
        return {
            "id": cursor.lastrowid,
            "job_id": job_id,
            "analyzed_at": timestamp,
            **normalized,
            "stale": False,
            "stale_reasons": [],
        }

    def latest_job_evaluation(self, job_id: str) -> dict[str, Any] | None:
        """Return the latest stored AI evaluation and whether its inputs changed."""
        job = self.show_job(job_id)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM job_evaluations WHERE job_id = ? ORDER BY id DESC LIMIT 1",
                (job_id,),
            ).fetchone()
        if row is None:
            return None
        result = json.loads(row["payload_json"])
        stale_reasons: list[str] = []
        if row["profile_sha256"] != sha256_file(
            self.root / "profile" / "candidate.json"
        ):
            stale_reasons.append("个人履历已在分析后更新")
        if row["preferences_sha256"] != sha256_file(
            self.root / "profile" / "preferences.json"
        ):
            stale_reasons.append("求职偏好已在分析后更新")
        if row["job_sha256"] != self._job_sha256(job):
            stale_reasons.append("职位信息已在分析后更新")
        return {
            "id": row["id"],
            "job_id": job_id,
            "analyzed_at": row["analyzed_at"],
            **result,
            "stale": bool(stale_reasons),
            "stale_reasons": stale_reasons,
        }

    def show_candidate_profile(self) -> dict[str, Any]:
        """Return the private candidate profile without mutating it."""
        self.require_initialized()
        profile = _json_read(self.root / "profile" / "candidate.json")
        if not isinstance(profile, dict):
            raise WorkspaceError("Candidate profile must be a JSON object")
        return profile

    def show_preferences(self) -> dict[str, Any]:
        """Return the private job-search preferences without mutating them."""
        self.require_initialized()
        preferences = _json_read(self.root / "profile" / "preferences.json")
        if not isinstance(preferences, dict):
            raise WorkspaceError("Preferences must be a JSON object")
        return preferences

    def update_candidate_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        """Atomically replace editable candidate facts after structural validation."""
        self.require_initialized()
        if not isinstance(profile, dict):
            raise WorkspaceError("Candidate profile must be a JSON object")
        for key in ("identity", "contact"):
            if not isinstance(profile.get(key), dict):
                raise WorkspaceError(f"Candidate profile {key} must be an object")
        if not isinstance(profile.get("summary"), str):
            raise WorkspaceError("Candidate profile summary must be a string")
        for key in ("experience", "education", "languages", "evidence"):
            if not isinstance(profile.get(key), list):
                raise WorkspaceError(f"Candidate profile {key} must be a list")
            if not all(isinstance(item, dict) for item in profile[key]):
                raise WorkspaceError(
                    f"Candidate profile {key} entries must be objects"
                )
        if not isinstance(profile.get("skills"), list):
            raise WorkspaceError("Candidate profile skills must be a list")
        if not all(isinstance(item, str) for item in profile["skills"]):
            raise WorkspaceError("Candidate profile skills entries must be strings")
        profile = dict(profile)
        profile["schema_version"] = SCHEMA_VERSION
        _json_write(self.root / "profile" / "candidate.json", profile)
        return profile

    def update_preferences(self, preferences: dict[str, Any]) -> dict[str, Any]:
        """Atomically replace editable search preferences after validation."""
        self.require_initialized()
        if not isinstance(preferences, dict):
            raise WorkspaceError("Preferences must be a JSON object")
        for key in (
            "target_roles",
            "target_domains",
            "locations",
            "hard_constraints",
            "soft_preferences",
        ):
            if not isinstance(preferences.get(key), list):
                raise WorkspaceError(f"Preferences {key} must be a list")
            if not all(isinstance(item, str) for item in preferences[key]):
                raise WorkspaceError(f"Preferences {key} entries must be strings")
        for key in ("work_style", "compensation"):
            if not isinstance(preferences.get(key), dict):
                raise WorkspaceError(f"Preferences {key} must be an object")
        work_style = preferences["work_style"]
        for key in (
            "remote_preferred",
            "autonomy_preferred",
            "focus_time_preferred",
        ):
            if key in work_style and not isinstance(work_style[key], bool):
                raise WorkspaceError(f"Preferences work_style.{key} must be a boolean")
        office_days = work_style.get("maximum_office_days_per_week")
        if office_days is not None and (
            isinstance(office_days, bool) or not isinstance(office_days, int)
        ):
            raise WorkspaceError(
                "Preferences work_style.maximum_office_days_per_week must be an integer or null"
            )
        if isinstance(office_days, int) and not 0 <= office_days <= 7:
            raise WorkspaceError(
                "Preferences work_style.maximum_office_days_per_week must be between 0 and 7"
            )
        compensation = preferences["compensation"]
        if "currency" in compensation and not isinstance(compensation["currency"], str):
            raise WorkspaceError("Preferences compensation.currency must be a string")
        for key in ("minimum", "target"):
            value = compensation.get(key)
            if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
                raise WorkspaceError(
                    f"Preferences compensation.{key} must be an integer or null"
                )
            if isinstance(value, int) and value < 0:
                raise WorkspaceError(
                    f"Preferences compensation.{key} must not be negative"
                )
        preferences = dict(preferences)
        preferences["schema_version"] = SCHEMA_VERSION
        _json_write(self.root / "profile" / "preferences.json", preferences)
        return preferences

    def update_job_status(self, job_id: str, *, status: str) -> dict[str, Any]:
        if status not in {"new", "saved", "skipped", "applied"}:
            raise WorkspaceError("Job status must be new, saved, skipped, or applied")
        with self.connect() as connection:
            current = connection.execute(
                "SELECT j.status, EXISTS("
                "SELECT 1 FROM applications AS a WHERE a.source_job_id = j.id"
                ") AS has_application "
                "FROM jobs AS j WHERE j.id = ?",
                (job_id,),
            ).fetchone()
            if current is None:
                raise WorkspaceError(f"Unknown discovered job: {job_id}")
            if (
                current["status"] == "applied" or current["has_application"]
            ) and status != "applied":
                raise WorkspaceError("Applied jobs cannot change back to another status")
            result = connection.execute(
                "UPDATE jobs SET status = ? WHERE id = ?", (status, job_id)
            )
            if result.rowcount != 1:
                raise WorkspaceError(f"Failed to update discovered job: {job_id}")
        return {"job_id": job_id, "status": status}

    def update_job_review(
        self, job_id: str, *, rating: int | None, notes: str
    ) -> dict[str, Any]:
        if rating is not None and rating not in range(1, 6):
            raise WorkspaceError("Job rating must be between 1 and 5")
        notes = notes.strip()
        if len(notes) > 4000:
            raise WorkspaceError("Job notes must not exceed 4000 characters")
        with self.connect() as connection:
            result = connection.execute(
                "UPDATE jobs SET rating = ?, notes = ? WHERE id = ?",
                (rating, notes, job_id),
            )
            if result.rowcount != 1:
                raise WorkspaceError(f"Unknown discovered job: {job_id}")
        return {"job_id": job_id, "rating": rating, "notes": notes}

    def create_application_from_job(self, job_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            existing = connection.execute(
                "SELECT id FROM applications WHERE source_job_id = ? ORDER BY created_at LIMIT 1",
                (job_id,),
            ).fetchone()
        if row is None:
            raise WorkspaceError(f"Unknown discovered job: {job_id}")
        if existing is not None:
            raise WorkspaceError(f"Job already has application: {existing['id']}")
        record = self.create_application(
            company=row["company"] or "Unknown company",
            role=row["title"],
            job_url=row["url"],
            source_job_id=job_id,
        )
        app_path = self.application_path(record["id"])
        posting_path = app_path / "source" / "posting.json"
        _json_write(posting_path, json.loads(row["raw_json"]), overwrite=False)
        record["source"] = self._relative(posting_path)
        record["source_job_id"] = job_id
        _json_write(app_path / "application.json", record)
        with self.connect() as connection:
            connection.execute(
                "UPDATE jobs SET status = 'applied' WHERE id = ?", (job_id,)
            )
            self._add_event(
                connection,
                record["id"],
                "discovered-job.linked",
                {"job_id": job_id, "portal": row["portal"], "url": row["url"]},
            )
        return record

    def application_for_job(self, job_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id, company, role, status FROM applications "
                "WHERE source_job_id = ? ORDER BY created_at LIMIT 1",
                (job_id,),
            ).fetchone()
        return dict(row) if row else None

    @staticmethod
    def _add_event(
        connection: sqlite3.Connection,
        application_id: str,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        connection.execute(
            "INSERT INTO events (application_id, event_type, created_at, data_json) VALUES (?, ?, ?, ?)",
            (
                application_id,
                event_type,
                now_iso(),
                json.dumps(data, ensure_ascii=False, sort_keys=True),
            ),
        )

    def list_applications(self) -> list[dict[str, Any]]:
        self.require_initialized()
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT applications.id, applications.company, applications.role, "
                "applications.status, applications.created_at, applications.updated_at, "
                "applications.job_url, drafts.status AS draft_status, "
                "drafts.revision AS draft_revision "
                "FROM applications LEFT JOIN drafts "
                "ON drafts.application_id = applications.id "
                "ORDER BY applications.created_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def show_application(self, application_id: str) -> dict[str, Any]:
        app_path = self.application_path(application_id)
        record = _json_read(app_path / "application.json")
        record["draft"] = self.show_draft(application_id)["summary"]
        record["packages"] = self.list_packages(application_id)
        with self.connect() as connection:
            submission_rows = connection.execute(
                "SELECT id, package_id, evidence_level, submitted_at, recorded_at, "
                "channel, external_reference, note, relative_path FROM submissions "
                "WHERE application_id = ? ORDER BY recorded_at",
                (application_id,),
            ).fetchall()
            record["submissions"] = []
            for row in submission_rows:
                submission = dict(row)
                try:
                    manifest = _json_read(
                        self.root / submission["relative_path"] / "submission.json"
                    )
                except WorkspaceError:
                    manifest = {}
                submission["files"] = list(manifest.get("files", []))
                record["submissions"].append(submission)
            record["events"] = [
                {
                    "type": row["event_type"],
                    "created_at": row["created_at"],
                    "data": json.loads(row["data_json"]),
                }
                for row in connection.execute(
                    "SELECT event_type, created_at, data_json FROM events "
                    "WHERE application_id = ? ORDER BY id",
                    (application_id,),
                ).fetchall()
            ]
        return record

    @staticmethod
    def _draft_summary(manifest: dict[str, Any]) -> dict[str, Any]:
        keys = (
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
        return {key: manifest.get(key) for key in keys}

    def _empty_draft_manifest(
        self,
        application_id: str,
        *,
        draft_id: str,
        created_at: str,
        relative_path: str,
    ) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "kind": "draft",
            "application_id": application_id,
            "draft_id": draft_id,
            "status": DEFAULT_DRAFT_STATUS,
            "revision": 0,
            "base_package_id": None,
            "relative_path": relative_path,
            "created_at": created_at,
            "updated_at": created_at,
            "label": None,
            "template_revision": TEMPLATE_REVISION,
            "files": [],
            "validation": validate_application_documents(self.root / relative_path),
        }

    def _ensure_draft_record(self, application_id: str) -> dict[str, Any]:
        application = self._application_row(application_id)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM drafts WHERE application_id = ?", (application_id,)
            ).fetchone()
        if row is not None:
            return dict(row)

        app_path = self.application_path(application_id)
        draft_path = app_path / "draft"
        draft_path.mkdir(parents=True, exist_ok=True)
        draft_id = f"{application_id}-draft"
        created_at = application["created_at"]
        manifest_path = draft_path / "manifest.json"
        if manifest_path.is_file():
            manifest = _json_read(manifest_path)
            if manifest.get("application_id") != application_id:
                raise WorkspaceError(
                    "Draft manifest belongs to a different application"
                )
        else:
            files = self._artifact_entries(
                draft_path,
                [
                    path
                    for path in draft_path.rglob("*")
                    if path.is_file() and path.name != "manifest.json"
                ],
            )
            manifest = self._empty_draft_manifest(
                application_id,
                draft_id=draft_id,
                created_at=created_at,
                relative_path=self._relative(draft_path),
            )
            manifest["files"] = files
            manifest["revision"] = 1 if files else 0
            manifest["status"] = "working" if files else DEFAULT_DRAFT_STATUS
            manifest["validation"] = validate_application_documents(draft_path)
            _json_write(manifest_path, manifest, overwrite=False)

        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO drafts
                  (application_id, draft_id, status, revision, base_package_id,
                   relative_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    application_id,
                    manifest.get("draft_id", draft_id),
                    manifest.get("status", DEFAULT_DRAFT_STATUS),
                    int(manifest.get("revision", 0)),
                    manifest.get("base_package_id"),
                    self._relative(draft_path),
                    manifest.get("created_at", created_at),
                    manifest.get("updated_at", created_at),
                ),
            )
        self._update_application_json(
            application_id,
            schema_version=SCHEMA_VERSION,
            draft=self._draft_summary(manifest),
        )
        return {
            "application_id": application_id,
            "draft_id": manifest.get("draft_id", draft_id),
            "status": manifest.get("status", DEFAULT_DRAFT_STATUS),
            "revision": int(manifest.get("revision", 0)),
            "base_package_id": manifest.get("base_package_id"),
            "relative_path": self._relative(draft_path),
            "created_at": manifest.get("created_at", created_at),
            "updated_at": manifest.get("updated_at", created_at),
        }

    def _draft_path(self, application_id: str) -> Path:
        row = self._ensure_draft_record(application_id)
        path = (self.root / row["relative_path"]).resolve()
        self._relative(path)
        if not path.is_dir():
            raise WorkspaceError(f"Missing draft directory: {path}")
        return path

    def _draft_manifest(self, application_id: str) -> dict[str, Any]:
        path = self._draft_path(application_id) / "manifest.json"
        manifest = _json_read(path)
        if manifest.get("application_id") != application_id:
            raise WorkspaceError("Draft manifest belongs to a different application")
        return manifest

    @staticmethod
    def _copy_artifacts(
        source: Path, destination: Path, *, exclude_manifest: bool = False
    ) -> None:
        if not source.is_dir():
            raise WorkspaceError(f"Artifact source is not a directory: {source}")
        for path in source.rglob("*"):
            if path.is_symlink():
                raise WorkspaceError(
                    f"Symbolic links are not allowed in artifacts: {path}"
                )
            if not path.is_file():
                continue
            relative = path.relative_to(source)
            if exclude_manifest and relative.as_posix() == "manifest.json":
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)

    def show_draft(self, application_id: str) -> dict[str, Any]:
        draft_path = self._draft_path(application_id)
        manifest = self._draft_manifest(application_id)
        saved_metadata = {
            str(entry.get("path")): entry for entry in manifest.get("files", [])
        }
        files = self._artifact_entries(
            draft_path,
            [
                path
                for path in draft_path.rglob("*")
                if path.is_file() and path.name != "manifest.json"
            ],
            metadata_by_path=saved_metadata,
        )
        validation = validate_application_documents(draft_path)
        summary = self._draft_summary({**manifest, "validation": validation})
        return {
            **manifest,
            "files": files,
            "validation": validation,
            "summary": summary,
        }

    def draft_files(self, application_id: str) -> list[dict[str, Any]]:
        return self.show_draft(application_id)["files"]

    def draft_file_path(self, application_id: str, relative_path: str) -> Path:
        draft_path = self._draft_path(application_id)
        allowed = {entry.get("path") for entry in self.draft_files(application_id)}
        if relative_path not in allowed:
            raise WorkspaceError(f"Unknown draft file: {relative_path}")
        path = (draft_path / relative_path).resolve()
        try:
            path.relative_to(draft_path)
        except ValueError as exc:
            raise WorkspaceError("Draft file escapes its directory") from exc
        if not path.is_file():
            raise WorkspaceError(f"Missing draft file: {relative_path}")
        return path

    def draft_readiness(self, application_id: str) -> dict[str, Any]:
        return validate_application_documents(self._draft_path(application_id))

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

        app_path = self.application_path(application_id)
        draft_path = self._draft_path(application_id)
        current = self._draft_manifest(application_id)
        current_revision = int(current.get("revision", 0))
        if expected_revision is not None and expected_revision != current_revision:
            raise WorkspaceError(
                f"Draft revision conflict: expected {expected_revision}, current {current_revision}"
            )

        temporary = Path(tempfile.mkdtemp(prefix=".draft-", dir=app_path))
        try:
            source_metadata: dict[str, dict[str, Any]] = {}
            if base_package_id:
                base_path = self._package_path(application_id, base_package_id)
                base_manifest = _json_read(base_path / "manifest.json")
                source_metadata = {
                    str(entry.get("path")): entry
                    for entry in base_manifest.get("files", [])
                }
                for entry in base_manifest.get("files", []):
                    relative = str(entry.get("path") or "")
                    if not relative:
                        continue
                    source = self.package_file_path(
                        application_id, base_package_id, relative
                    )
                    target = temporary / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)
            else:
                self._copy_artifacts(draft_path, temporary, exclude_manifest=True)
                source_metadata = {
                    str(entry.get("path")): entry for entry in current.get("files", [])
                }

            if source_directory is not None:
                source = Path(source_directory).expanduser().resolve()
                self._copy_artifacts(source, temporary, exclude_manifest=True)

            for relative in remove_paths or ():
                if relative in REQUIRED_DOCUMENTS or not relative.startswith(
                    "deliverables/"
                ):
                    raise WorkspaceError(
                        f"Only uploaded deliverables can be removed: {relative}"
                    )
                target = (temporary / relative).resolve()
                try:
                    target.relative_to(temporary)
                except ValueError as exc:
                    raise WorkspaceError(
                        "Deliverable path escapes the working area"
                    ) from exc
                if not target.is_file():
                    raise WorkspaceError(f"Unknown deliverable: {relative}")
                target.unlink()
                source_metadata.pop(relative, None)

            for name, payload in (documents or {}).items():
                if name not in REQUIRED_DOCUMENTS:
                    raise WorkspaceError(
                        f"Only application Markdown can be saved: {name}"
                    )
                if len(payload) > 2 * 1024 * 1024:
                    raise WorkspaceError(f"Markdown file is too large: {name}")
                try:
                    content = payload.decode("utf-8-sig")
                except UnicodeDecodeError as exc:
                    raise WorkspaceError(
                        f"Markdown file must use UTF-8: {name}"
                    ) from exc
                if not content.strip():
                    raise WorkspaceError(f"Markdown file is empty: {name}")
                (temporary / name).write_text(content, encoding="utf-8", newline="\n")

            artifact_metadata: dict[str, dict[str, Any]] = {}
            for original_name, artifact in (artifacts or {}).items():
                filename = Path(original_name).name
                if (
                    filename != original_name
                    or not filename
                    or filename.startswith(".")
                ):
                    raise WorkspaceError(
                        f"Unsafe deliverable filename: {original_name}"
                    )
                extension = Path(filename).suffix.lower()
                if extension not in ALLOWED_DELIVERABLE_EXTENSIONS:
                    raise WorkspaceError("Deliverables must be PDF or DOCX")
                payload = artifact.get("payload")
                if not isinstance(payload, (bytes, bytearray)) or not payload:
                    raise WorkspaceError(f"Deliverable is empty: {filename}")
                if len(payload) > MAX_DELIVERABLE_BYTES:
                    raise WorkspaceError(f"Deliverable is too large: {filename}")
                role = str(artifact.get("role") or "deliverable")
                purpose = str(artifact.get("purpose") or "other")
                origin = str(artifact.get("origin") or "user_uploaded")
                if role not in VALID_ARTIFACT_ROLES:
                    raise WorkspaceError(f"Unknown artifact role: {role}")
                if purpose not in VALID_ARTIFACT_PURPOSES:
                    raise WorkspaceError(f"Unknown artifact purpose: {purpose}")
                if origin not in VALID_ARTIFACT_ORIGINS:
                    raise WorkspaceError(f"Unknown artifact origin: {origin}")
                relative = f"deliverables/{filename}"
                target = temporary / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(bytes(payload))
                artifact_metadata[relative] = {
                    "role": role,
                    "purpose": purpose,
                    "origin": origin,
                    "source_path": artifact.get("source_path") or None,
                }

            files = self._artifact_entries(
                temporary,
                temporary.rglob("*"),
                metadata_by_path={**source_metadata, **artifact_metadata},
            )
            if not files:
                raise WorkspaceError("Draft contains no files")
            updated_at = now_iso()
            validation = validate_application_documents(temporary)
            manifest = {
                **current,
                "schema_version": SCHEMA_VERSION,
                "kind": "draft",
                "application_id": application_id,
                "draft_id": current["draft_id"],
                "status": status,
                "revision": current_revision + 1,
                "base_package_id": base_package_id or current.get("base_package_id"),
                "updated_at": updated_at,
                "label": label if label is not None else current.get("label"),
                "template_revision": TEMPLATE_REVISION,
                "files": files,
                "validation": validation,
            }
            _json_write(temporary / "manifest.json", manifest, overwrite=False)

            backup = app_path / f".draft-backup-{timestamp_id()}-{os.getpid()}"
            draft_path.replace(backup)
            try:
                temporary.replace(draft_path)
                with self.connect() as connection:
                    result = connection.execute(
                        """
                        UPDATE drafts
                        SET status = ?, revision = ?, base_package_id = ?,
                            relative_path = ?, updated_at = ?
                        WHERE application_id = ? AND revision = ?
                        """,
                        (
                            manifest["status"],
                            manifest["revision"],
                            manifest["base_package_id"],
                            self._relative(draft_path),
                            updated_at,
                            application_id,
                            current_revision,
                        ),
                    )
                    if result.rowcount != 1:
                        raise WorkspaceError(f"Unknown draft for {application_id}")
                    self._add_event(
                        connection,
                        application_id,
                        "draft.created" if current_revision == 0 else "draft.updated",
                        {
                            "actor": actor,
                            "draft_id": manifest["draft_id"],
                            "revision": manifest["revision"],
                            "status": manifest["status"],
                            "base_package_id": manifest["base_package_id"],
                            "validation": validation,
                        },
                    )
                    connection.execute(
                        "UPDATE applications SET updated_at = ? WHERE id = ?",
                        (updated_at, application_id),
                    )
                self._update_application_json(
                    application_id,
                    draft=self._draft_summary(manifest),
                    updated_at=updated_at,
                )
            except Exception:
                if draft_path.exists():
                    failed = app_path / f".draft-failed-{timestamp_id()}-{os.getpid()}"
                    draft_path.replace(failed)
                    shutil.rmtree(failed, ignore_errors=True)
                if backup.exists():
                    backup.replace(draft_path)
                raise
            finally:
                if backup.exists():
                    shutil.rmtree(backup, ignore_errors=True)
            return {**manifest, "summary": self._draft_summary(manifest)}
        finally:
            if temporary.exists():
                shutil.rmtree(temporary, ignore_errors=True)

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
            status="working",
            actor=actor,
            expected_revision=expected_revision,
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
            status="working",
            actor=actor,
            expected_revision=expected_revision,
        )

    def validate_draft(
        self, application_id: str, *, actor: str = "cli"
    ) -> dict[str, Any]:
        draft_path = self._draft_path(application_id)
        manifest = self._draft_manifest(application_id)
        validation = validate_application_documents(draft_path)
        validated_at = now_iso()
        manifest["validation"] = validation
        manifest["validated_at"] = validated_at
        manifest["updated_at"] = validated_at
        _json_write(draft_path / "manifest.json", manifest)
        with self.connect() as connection:
            connection.execute(
                "UPDATE drafts SET updated_at = ? WHERE application_id = ? AND revision = ?",
                (validated_at, application_id, int(manifest.get("revision", 0))),
            )
            self._add_event(
                connection,
                application_id,
                "draft.validated",
                {
                    "actor": actor,
                    "draft_id": manifest["draft_id"],
                    "revision": manifest.get("revision", 0),
                    "validation": validation,
                },
            )
            connection.execute(
                "UPDATE applications SET updated_at = ? WHERE id = ?",
                (validated_at, application_id),
            )
        self._update_application_json(
            application_id,
            draft=self._draft_summary(manifest),
            updated_at=validated_at,
        )
        return {
            **manifest,
            "validation": validation,
            "summary": self._draft_summary(manifest),
        }

    def restore_current_materials_from_package(
        self,
        application_id: str,
        *,
        package_id: str,
        actor: str = "web",
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        package = next(
            (
                item
                for item in self.list_packages(application_id)
                if item["id"] == package_id
            ),
            None,
        )
        if package is None:
            raise WorkspaceError(
                f"Unknown material package {package_id} for {application_id}"
            )
        return self.save_draft(
            application_id,
            base_package_id=package_id,
            label=f"恢复自 {package.get('label') or package_id}",
            status="working",
            actor=actor,
            expected_revision=expected_revision,
        )

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
        draft_path = self._draft_path(application_id)
        draft = self._draft_manifest(application_id)
        revision = int(draft.get("revision", 0))
        if expected_revision is not None and expected_revision != revision:
            raise WorkspaceError(
                f"Draft revision conflict: expected {expected_revision}, current {revision}"
            )
        files = self.show_draft(application_id)["files"]
        if not files:
            raise WorkspaceError("Current materials contain no files")
        readiness = validate_application_documents(draft_path)
        if require_content_ready and not readiness["ready"]:
            problems = (
                readiness["missing"]
                + readiness["errors"]
                + [f"{name} 仍有要确认占位符" for name in readiness["placeholders"]]
            )
            raise WorkspaceError(
                "Current content cannot be locked: " + "; ".join(problems)
            )

        manifest = self._create_material_package(
            application_id,
            source_directory=draft_path,
            label=label or draft.get("label") or f"申请材料 revision {revision}",
            template_revision=draft.get("template_revision") or TEMPLATE_REVISION,
            source_draft_id=draft["draft_id"],
            source_draft_revision=revision,
            created=created,
        )
        packaged_at = manifest["created_at"]
        with self.connect() as connection:
            current_row = connection.execute(
                "SELECT revision FROM drafts WHERE application_id = ?",
                (application_id,),
            ).fetchone()
            if current_row is None or current_row["revision"] != revision:
                raise WorkspaceError("Current materials changed while packaging")
            self._add_event(
                connection,
                application_id,
                "materials.packaged",
                {
                    "actor": actor,
                    "draft_id": draft["draft_id"],
                    "revision": revision,
                    "package_id": manifest["package_id"],
                },
            )
            connection.execute(
                "UPDATE applications SET updated_at = ? WHERE id = ?",
                (packaged_at, application_id),
            )
        self._update_application_json(
            application_id,
            updated_at=packaged_at,
        )
        return {**manifest, "draft_id": draft["draft_id"], "draft_revision": revision}

    def discard_draft(
        self,
        application_id: str,
        *,
        actor: str = "web",
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        application = self._application_row(application_id)
        draft_path = self._draft_path(application_id)
        draft = self._draft_manifest(application_id)
        revision = int(draft.get("revision", 0))
        if expected_revision is not None and expected_revision != revision:
            raise WorkspaceError(
                f"Draft revision conflict: expected {expected_revision}, current {revision}"
            )
        discarded_at = now_iso()
        trash_path = (
            self.root
            / "trash"
            / "drafts"
            / application_id
            / f"{draft['draft_id']}-r{revision}-{timestamp_id()}"
        )
        has_content = any(
            path.is_file() and path.name != "manifest.json"
            for path in draft_path.rglob("*")
        )
        if has_content or draft.get("status") != DEFAULT_DRAFT_STATUS:
            trash_path.parent.mkdir(parents=True, exist_ok=True)
            if trash_path.exists():
                raise WorkspaceError(f"Trash destination already exists: {trash_path}")
            draft_path.replace(trash_path)
        draft_path.mkdir(parents=True, exist_ok=True)
        replacement = self._empty_draft_manifest(
            application_id,
            draft_id=draft["draft_id"],
            created_at=draft.get("created_at") or application["created_at"],
            relative_path=self._relative(draft_path),
        )
        replacement["revision"] = revision + 1
        replacement["updated_at"] = discarded_at
        _json_write(draft_path / "manifest.json", replacement, overwrite=False)
        with self.connect() as connection:
            result = connection.execute(
                """
                UPDATE drafts
                SET status = ?, revision = ?, base_package_id = NULL, updated_at = ?
                WHERE application_id = ? AND revision = ?
                """,
                (
                    replacement["status"],
                    replacement["revision"],
                    discarded_at,
                    application_id,
                    revision,
                ),
            )
            if result.rowcount != 1:
                raise WorkspaceError("Draft changed while it was being discarded")
            self._add_event(
                connection,
                application_id,
                "draft.discarded",
                {
                    "actor": actor,
                    "draft_id": replacement["draft_id"],
                    "previous_revision": revision,
                    "revision": replacement["revision"],
                    "trash_path": (
                        self._relative(trash_path) if trash_path.exists() else None
                    ),
                },
            )
            connection.execute(
                "UPDATE applications SET updated_at = ? WHERE id = ?",
                (discarded_at, application_id),
            )
        self._update_application_json(
            application_id,
            draft=self._draft_summary(replacement),
            updated_at=discarded_at,
        )
        return {
            **replacement,
            "trash_path": self._relative(trash_path) if trash_path.exists() else None,
            "summary": self._draft_summary(replacement),
        }

    @staticmethod
    def _infer_artifact_metadata(relative_path: str) -> dict[str, Any]:
        name = Path(relative_path).name.lower()
        extension = Path(name).suffix.lower()
        purpose = "other"
        if "shokumu" in name or "職務経歴" in name:
            purpose = "shokumu_keirekisho"
        elif "rirekisho" in name or "履歴書" in name or "履歴書" in name:
            purpose = "rirekisho"
        if extension == ".md":
            role = "content_source"
        elif extension == ".pdf":
            role = "deliverable"
        elif extension == ".docx":
            role = "editable_source"
        else:
            role = "supporting"
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
    def _artifact_entries(
        base: Path,
        paths: Iterable[Path],
        *,
        metadata_by_path: dict[str, dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        entries = []
        metadata_by_path = metadata_by_path or {}
        for path in sorted(paths, key=lambda item: item.as_posix()):
            if path.is_symlink():
                raise WorkspaceError(
                    f"Symbolic links are not allowed in artifacts: {path}"
                )
            if not path.is_file():
                continue
            relative = path.relative_to(base).as_posix()
            metadata = Workspace._infer_artifact_metadata(relative)
            for key in ("role", "purpose", "origin", "media_type", "source_path"):
                if key in metadata_by_path.get(relative, {}):
                    metadata[key] = metadata_by_path[relative].get(key)
            entries.append(
                {
                    "path": relative,
                    "size": path.stat().st_size,
                    "sha256": sha256_file(path),
                    **metadata,
                }
            )
        return entries

    def _create_material_package(
        self,
        application_id: str,
        *,
        source_directory: str | Path,
        label: str | None = None,
        template_revision: str | None = None,
        source_draft_id: str | None = None,
        source_draft_revision: int | None = None,
        created: datetime | None = None,
    ) -> dict[str, Any]:
        """Copy current materials into a new immutable material package."""
        app_path = self.application_path(application_id)
        source = Path(source_directory).expanduser().resolve()
        if not source.is_dir():
            raise WorkspaceError(f"Material source is not a directory: {source}")
        source_files = [
            path
            for path in source.rglob("*")
            if path.is_file() and path.relative_to(source).as_posix() != "manifest.json"
        ]
        if not source_files:
            raise WorkspaceError("Current materials contain no files")
        if any(path.is_symlink() for path in source.rglob("*")):
            raise WorkspaceError("Material source may not contain symbolic links")

        package_id = timestamp_id(created)
        packages_root = app_path / "packages"
        destination = packages_root / package_id
        if destination.exists():
            raise WorkspaceError(f"Material package already exists: {package_id}")

        temporary = packages_root / f".tmp-{package_id}-{os.getpid()}"
        if temporary.exists():
            raise WorkspaceError(f"Temporary package path already exists: {temporary}")
        temporary.mkdir()
        try:
            for source_file in source_files:
                relative = source_file.relative_to(source)
                target = temporary / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, target)
            try:
                source_manifest = _json_read(source / "manifest.json")
            except WorkspaceError:
                source_manifest = {}
            source_metadata = {
                str(entry.get("path")): entry
                for entry in source_manifest.get("files", [])
            }
            files = self._artifact_entries(
                temporary,
                temporary.rglob("*"),
                metadata_by_path=source_metadata,
            )
            created_at = (
                (created or datetime.now().astimezone())
                .astimezone()
                .isoformat(timespec="microseconds")
            )
            manifest = {
                "schema_version": SCHEMA_VERSION,
                "kind": "material_package",
                "package_id": package_id,
                "application_id": application_id,
                "created_at": created_at,
                "label": label,
                "template_revision": template_revision or TEMPLATE_REVISION,
                "source_draft_id": source_draft_id,
                "source_draft_revision": source_draft_revision,
                "files": files,
            }
            _json_write(temporary / "manifest.json", manifest, overwrite=False)
            temporary.replace(destination)
        except Exception:
            if temporary.exists():
                shutil.rmtree(temporary)
            raise

        with self.connect() as connection:
            connection.execute(
                "INSERT INTO material_packages (id, application_id, created_at, relative_path, label) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    package_id,
                    application_id,
                    manifest["created_at"],
                    self._relative(destination),
                    label,
                ),
            )
        return manifest

    def list_packages(self, application_id: str) -> list[dict[str, Any]]:
        self._application_row(application_id)
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT id, created_at, relative_path, label FROM material_packages "
                "WHERE application_id = ? ORDER BY created_at",
                (application_id,),
            ).fetchall()
        packages: list[dict[str, Any]] = []
        for row in rows:
            package = dict(row)
            try:
                manifest = _json_read(
                    self._package_path(application_id, package["id"]) / "manifest.json"
                )
            except WorkspaceError:
                manifest = {}
            package.update(
                {
                    "package_id": manifest.get("package_id", package["id"]),
                    "source_draft_id": manifest.get("source_draft_id"),
                    "source_draft_revision": manifest.get("source_draft_revision"),
                    "template_revision": manifest.get("template_revision"),
                    "locked_at": manifest.get("created_at"),
                }
            )
            packages.append(package)
        return packages

    def package_files(
        self, application_id: str, package_id: str
    ) -> list[dict[str, Any]]:
        package_path = self._package_path(application_id, package_id)
        manifest = _json_read(package_path / "manifest.json")
        return list(manifest.get("files", []))

    def package_file_path(
        self, application_id: str, package_id: str, relative_path: str
    ) -> Path:
        package_path = self._package_path(application_id, package_id)
        manifest = _json_read(package_path / "manifest.json")
        allowed = {entry.get("path") for entry in manifest.get("files", [])}
        if relative_path not in allowed:
            raise WorkspaceError(f"Unknown material-package file: {relative_path}")
        path = (package_path / relative_path).resolve()
        try:
            path.relative_to(package_path)
        except ValueError as exc:
            raise WorkspaceError(
                "Package file escapes its immutable directory"
            ) from exc
        if not path.is_file():
            raise WorkspaceError(f"Missing package file: {relative_path}")
        return path

    def package_readiness(self, application_id: str, package_id: str) -> dict[str, Any]:
        package_path = self._package_path(application_id, package_id)
        manifest = _json_read(package_path / "manifest.json")
        files = list(manifest.get("files", []))
        integrity_errors = self._verify_manifest(
            package_path, manifest, ignored_paths={"manifest.json"}
        )
        deliverables = [entry for entry in files if entry.get("role") == "deliverable"]
        sources = [entry for entry in files if entry.get("role") == "content_source"]
        content = validate_application_documents(package_path)
        return {
            "integrity_ok": not integrity_errors,
            "integrity_errors": integrity_errors,
            "has_deliverables": bool(deliverables),
            "deliverables": deliverables,
            "sources": sources,
            "content": content,
            "ready_for_exact_files": bool(deliverables) and not integrity_errors,
            "ready_for_source_only": bool(sources) and not integrity_errors,
        }

    def package_is_submitted(self, application_id: str, package_id: str) -> bool:
        self._package_path(application_id, package_id)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM submissions WHERE application_id = ? AND package_id = ? LIMIT 1",
                (application_id, package_id),
            ).fetchone()
        return row is not None

    def delete_package(self, application_id: str, *, package_id: str) -> dict[str, Any]:
        """Move an unreferenced immutable material package to local trash."""
        if self.package_is_submitted(application_id, package_id):
            raise WorkspaceError(
                "A material package referenced by a submission is permanently locked"
            )

        package_path = self._package_path(application_id, package_id)
        manifest = _json_read(package_path / "manifest.json")
        trash_path = self.root / "trash" / "packages" / application_id / package_id
        if trash_path.exists():
            raise WorkspaceError(f"Trash destination already exists: {trash_path}")
        trash_path.parent.mkdir(parents=True, exist_ok=True)
        package_path.replace(trash_path)
        deleted_at = now_iso()
        data = {
            "package_id": package_id,
            "label": manifest.get("label"),
            "deleted_at": deleted_at,
            "trash_path": self._relative(trash_path),
        }
        try:
            with self.connect() as connection:
                result = connection.execute(
                    "DELETE FROM material_packages WHERE application_id = ? AND id = ?",
                    (application_id, package_id),
                )
                if result.rowcount != 1:
                    raise WorkspaceError(
                        f"Unknown material package {package_id} for {application_id}"
                    )
                connection.execute(
                    "UPDATE applications SET updated_at = ? WHERE id = ?",
                    (deleted_at, application_id),
                )
                self._add_event(
                    connection, application_id, "materials.package-deleted", data
                )
        except Exception:
            if trash_path.exists() and not package_path.exists():
                trash_path.replace(package_path)
            raise
        self._update_application_json(application_id, updated_at=deleted_at)
        return data

    def _package_path(self, application_id: str, package_id: str) -> Path:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT relative_path FROM material_packages WHERE application_id = ? AND id = ?",
                (application_id, package_id),
            ).fetchone()
        if row is None:
            raise WorkspaceError(
                f"Unknown material package {package_id} for {application_id}"
            )
        path = (self.root / row["relative_path"]).resolve()
        self._relative(path)
        return path

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
        app_path = self.application_path(application_id)
        if evidence_level not in VALID_EVIDENCE_LEVELS:
            raise WorkspaceError(f"Unknown submission evidence level: {evidence_level}")
        if channel not in VALID_SUBMISSION_CHANNELS:
            raise WorkspaceError(f"Unknown submission channel: {channel}")
        selected = list(dict.fromkeys(selected_paths or []))

        if evidence_level == "status_only":
            if package_id or selected:
                raise WorkspaceError(
                    "A status-only submission cannot claim material files"
                )
            package_path = None
            package_manifest: dict[str, Any] = {}
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
            package_path = self._package_path(application_id, package_id)
            package_manifest = _json_read(package_path / "manifest.json")
            integrity_errors = self._verify_manifest(
                package_path, package_manifest, ignored_paths={"manifest.json"}
            )
            if integrity_errors:
                raise WorkspaceError(
                    "Material package integrity check failed: "
                    + "; ".join(integrity_errors)
                )
            allowed = {
                str(entry.get("path")): entry
                for entry in package_manifest.get("files", [])
            }
            if evidence_level == "exact_files":
                if not selected:
                    raise WorkspaceError("Select the exact files that were sent")
                unknown = [path for path in selected if path not in allowed]
                if unknown:
                    raise WorkspaceError(
                        "Unknown submitted package files: " + ", ".join(unknown)
                    )
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
                raise WorkspaceError(
                    "Source-only submissions do not claim exact sent files"
                )

        recorded_at = (
            (created or datetime.now().astimezone())
            .astimezone()
            .isoformat(timespec="microseconds")
        )
        if submitted_at:
            try:
                parsed_submitted_at = datetime.fromisoformat(submitted_at)
                if parsed_submitted_at.tzinfo is None:
                    parsed_submitted_at = parsed_submitted_at.astimezone()
                submitted_at_value = parsed_submitted_at.astimezone().isoformat(
                    timespec="microseconds"
                )
            except ValueError as exc:
                raise WorkspaceError("Invalid submitted_at value") from exc
        else:
            submitted_at_value = recorded_at

        submission_id = timestamp_id(created)
        destination = app_path / "submitted" / submission_id
        if destination.exists():
            raise WorkspaceError(f"Submission already exists: {submission_id}")
        files_root = destination / "files"
        files_root.mkdir(parents=True)
        copied_metadata: dict[str, dict[str, Any]] = {}
        if evidence_level == "exact_files" and package_path is not None:
            package_files = {
                str(entry.get("path")): entry
                for entry in package_manifest.get("files", [])
            }
            for relative in selected:
                source_file = package_path / relative
                target = files_root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, target)
                copied_metadata[relative] = package_files[relative]
        copied_files = self._artifact_entries(
            files_root,
            files_root.rglob("*"),
            metadata_by_path=copied_metadata,
        )
        submission = {
            "schema_version": SCHEMA_VERSION,
            "application_id": application_id,
            "submission_id": submission_id,
            "package_id": package_id,
            "evidence_level": evidence_level,
            "submitted_at": submitted_at_value,
            "recorded_at": recorded_at,
            "channel": channel,
            "external_reference": external_reference,
            "note": note,
            "selected_paths": selected,
            "files": copied_files,
        }
        _json_write(destination / "submission.json", submission, overwrite=False)

        with self.connect() as connection:
            connection.execute(
                "INSERT INTO submissions "
                "(id, application_id, package_id, evidence_level, submitted_at, "
                "recorded_at, channel, external_reference, note, relative_path) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    submission_id,
                    application_id,
                    package_id,
                    evidence_level,
                    submitted_at_value,
                    recorded_at,
                    channel,
                    external_reference,
                    note,
                    self._relative(destination),
                ),
            )
            connection.execute(
                "UPDATE applications SET status = 'applied', updated_at = ? WHERE id = ?",
                (recorded_at, application_id),
            )
            self._add_event(
                connection, application_id, "application.submitted", submission
            )
        self._update_application_json(
            application_id, status="applied", updated_at=recorded_at
        )
        return submission

    def update_status(
        self, application_id: str, *, status: str, note: str | None = None
    ) -> dict[str, Any]:
        self._application_row(application_id)
        if status not in VALID_STATUSES:
            raise WorkspaceError(
                f"Invalid status {status!r}; expected one of: {', '.join(sorted(VALID_STATUSES))}"
            )
        if status == "applied":
            raise WorkspaceError("请通过“记录已完成的投递”进入已投递阶段")
        updated_at = now_iso()
        data = {"status": status, "note": note}
        with self.connect() as connection:
            connection.execute(
                "UPDATE applications SET status = ?, updated_at = ? WHERE id = ?",
                (status, updated_at, application_id),
            )
            self._add_event(connection, application_id, "status.changed", data)
        self._update_application_json(
            application_id, status=status, updated_at=updated_at
        )
        return {
            "application_id": application_id,
            "status": status,
            "updated_at": updated_at,
        }

    def _update_application_json(self, application_id: str, **changes: Any) -> None:
        path = self.application_path(application_id) / "application.json"
        record = _json_read(path)
        record.update(changes)
        _json_write(path, record)

    @staticmethod
    def _verify_manifest(
        base: Path,
        manifest: dict[str, Any],
        *,
        ignored_paths: set[str] | None = None,
    ) -> list[str]:
        errors: list[str] = []
        expected_paths: set[str] = set()
        for entry in manifest.get("files", []):
            relative = Path(entry.get("path", ""))
            if relative.is_absolute() or ".." in relative.parts:
                errors.append(f"unsafe path {relative}")
                continue
            normalized = relative.as_posix()
            if normalized in expected_paths:
                errors.append(f"duplicate manifest path {normalized}")
                continue
            expected_paths.add(normalized)
            path = base / relative
            if not path.is_file():
                errors.append(f"missing {normalized}")
                continue
            if path.stat().st_size != entry.get("size"):
                errors.append(f"size mismatch {normalized}")
            actual = sha256_file(path)
            if actual != entry.get("sha256"):
                errors.append(f"hash mismatch {normalized}")
        actual_paths = {
            path.relative_to(base).as_posix()
            for path in base.rglob("*")
            if path.is_file()
        }
        unexpected = actual_paths - expected_paths - (ignored_paths or set())
        errors.extend(f"unexpected file {path}" for path in sorted(unexpected))
        return errors

    def audit(self) -> dict[str, Any]:
        self.require_initialized()
        errors: list[str] = []
        checked_drafts = 0
        checked_packages = 0
        checked_submissions = 0
        with self.connect() as connection:
            drafts = connection.execute(
                "SELECT application_id, relative_path FROM drafts"
            ).fetchall()
            packages = connection.execute(
                "SELECT application_id, id, relative_path FROM material_packages"
            ).fetchall()
            submissions = connection.execute(
                "SELECT application_id, id, relative_path FROM submissions"
            ).fetchall()

        for row in drafts:
            base = (self.root / row["relative_path"]).resolve()
            try:
                self._relative(base)
                manifest = _json_read(base / "manifest.json")
                errors.extend(
                    f"draft {row['application_id']}: {error}"
                    for error in self._verify_manifest(
                        base, manifest, ignored_paths={"manifest.json"}
                    )
                )
            except WorkspaceError as exc:
                errors.append(f"draft {row['application_id']}: {exc}")
            checked_drafts += 1

        for row in packages:
            base = (self.root / row["relative_path"]).resolve()
            try:
                self._relative(base)
                manifest = _json_read(base / "manifest.json")
                errors.extend(
                    f"package {row['application_id']}/{row['id']}: {error}"
                    for error in self._verify_manifest(
                        base, manifest, ignored_paths={"manifest.json"}
                    )
                )
            except WorkspaceError as exc:
                errors.append(f"package {row['application_id']}/{row['id']}: {exc}")
            checked_packages += 1

        for row in submissions:
            base = (self.root / row["relative_path"]).resolve()
            try:
                self._relative(base)
                manifest = _json_read(base / "submission.json")
                errors.extend(
                    f"submission {row['application_id']}/{row['id']}: {error}"
                    for error in self._verify_manifest(base / "files", manifest)
                )
            except WorkspaceError as exc:
                errors.append(f"submission {row['application_id']}/{row['id']}: {exc}")
            checked_submissions += 1

        return {
            "ok": not errors,
            "checked_drafts": checked_drafts,
            "checked_packages": checked_packages,
            "checked_submissions": checked_submissions,
            "errors": errors,
        }

    def export_summary(self) -> dict[str, Any]:
        self.require_initialized()
        exported_at = now_iso()
        payload = {
            "schema_version": SCHEMA_VERSION,
            "exported_at": exported_at,
            "applications": [
                self.show_application(item["id"]) for item in self.list_applications()
            ],
        }
        output = self.root / "exports" / f"applications-{timestamp_id()}.json"
        _json_write(output, payload, overwrite=False)
        return {"path": str(output), "applications": len(payload["applications"])}
