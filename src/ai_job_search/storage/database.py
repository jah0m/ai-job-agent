"""SQLite connection, schema, and Storage-v2 initialization."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .common import (
    DOMAIN_SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
    WorkspaceError,
    canonical_json,
    json_hash,
    now_iso,
)
from .contracts import StorageDomainPort
from .objects import ObjectStore


class StorageDatabase(StorageDomainPort):
    """Own the durable SQLite connection and the unchanged Storage-v2 schema."""

    def __init__(self, root: str | Path = ".job-search") -> None:
        self.root = Path(root).expanduser().resolve()
        self.db_path = self.root / "workspace.sqlite3"
        self.objects = ObjectStore(self.root / "objects" / "sha256")

    def _is_staging_path(self, path: Path) -> bool:
        resolved = path.expanduser().resolve()
        return any(self._is_below(resolved, self.root / name) for name in ("cache", "operations"))

    @staticmethod
    def _is_below(path: Path, root: Path) -> bool:
        try:
            path.relative_to(root.resolve())
            return True
        except ValueError:
            return False

    def consume_staging_file(self, path: str | Path) -> bool:
        """Delete a consumed file only when it is inside a staging directory."""

        try:
            target = Path(path).expanduser().resolve()
        except OSError:
            return False
        if not self._is_staging_path(target) or not target.is_file():
            return False
        try:
            target.unlink()
        except OSError:
            return False
        parent = target.parent
        operations_root = (self.root / "operations").resolve()
        while parent != operations_root and self._is_below(parent, operations_root):
            try:
                parent.rmdir()
            except OSError:
                break
            parent = parent.parent
        return True

    def initialize(self) -> dict[str, Any]:
        self.root.mkdir(parents=True, exist_ok=True)
        for relative in ("objects/sha256", "operations", "exports", "backups", "trash"):
            (self.root / relative).mkdir(parents=True, exist_ok=True)
        self.objects.initialize()
        with self.connect(require_initialized=False) as connection:
            self._create_schema(connection)
            self._ensure_defaults(connection)
        return {
            "workspace": str(self.root),
            "database": str(self.db_path),
            "storage_schema_version": STORAGE_SCHEMA_VERSION,
            "initialized": True,
        }

    def require_initialized(self) -> None:
        if not self.db_path.is_file():
            raise WorkspaceError(
                f"Workspace is not initialized at {self.root}. Run `job-search init`."
            )

    @contextmanager
    def connect(self, *, require_initialized: bool = True) -> Iterator[sqlite3.Connection]:
        if require_initialized:
            self.require_initialized()
        self.root.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = FULL")
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
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS storage_meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS profile_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              version INTEGER NOT NULL UNIQUE,
              payload_json TEXT NOT NULL,
              payload_sha256 TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              actor TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS preference_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              version INTEGER NOT NULL UNIQUE,
              payload_json TEXT NOT NULL,
              payload_sha256 TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              actor TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workspace_state (
              singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
              current_profile_version_id INTEGER NOT NULL REFERENCES profile_versions(id),
              current_preference_version_id INTEGER NOT NULL REFERENCES preference_versions(id),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS artifacts (
              sha256 TEXT PRIMARY KEY CHECK(length(sha256) = 64),
              size INTEGER NOT NULL CHECK(size >= 0),
              media_type TEXT NOT NULL,
              original_filename TEXT,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              portal TEXT NOT NULL,
              external_id TEXT,
              canonical_url TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('new','saved','skipped','applied')),
              rating INTEGER CHECK(rating IS NULL OR rating BETWEEN 1 AND 5),
              notes TEXT NOT NULL DEFAULT '',
              current_version_id INTEGER,
              first_seen_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL,
              UNIQUE(portal, canonical_url),
              UNIQUE(portal, external_id)
            );
            CREATE TABLE IF NOT EXISTS job_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
              schema_version INTEGER NOT NULL,
              normalized_json TEXT NOT NULL,
              normalized_sha256 TEXT NOT NULL,
              source_artifact_sha256 TEXT NOT NULL REFERENCES artifacts(sha256),
              retrieved_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              UNIQUE(job_id, normalized_sha256, source_artifact_sha256)
            );
            CREATE INDEX IF NOT EXISTS idx_job_versions_job ON job_versions(job_id, id DESC);
            CREATE TABLE IF NOT EXISTS job_evaluations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
              job_version_id INTEGER NOT NULL REFERENCES job_versions(id),
              profile_version_id INTEGER NOT NULL REFERENCES profile_versions(id),
              preference_version_id INTEGER NOT NULL REFERENCES preference_versions(id),
              analyzed_at TEXT NOT NULL,
              recommendation TEXT NOT NULL CHECK(recommendation IN ('pursue','consider','skip')),
              payload_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_job_evaluations_latest ON job_evaluations(job_id, id DESC);
            CREATE TABLE IF NOT EXISTS applications (
              id TEXT PRIMARY KEY,
              company TEXT NOT NULL,
              role TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              job_url TEXT,
              source_job_id TEXT REFERENCES jobs(id),
              source_artifact_sha256 TEXT REFERENCES artifacts(sha256),
              revision INTEGER NOT NULL DEFAULT 0,
              UNIQUE(source_job_id)
            );
            CREATE TABLE IF NOT EXISTS application_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
              event_type TEXT NOT NULL,
              created_at TEXT NOT NULL,
              data_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS drafts (
              application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
              draft_id TEXT NOT NULL UNIQUE,
              current_revision INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL CHECK(status IN ('empty','working')),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            -- A short-lived, transaction-local authorization marker used by
            -- the application deletion operation. It intentionally has no
            -- foreign key so it remains visible while child cascades run.
            CREATE TABLE IF NOT EXISTS application_delete_intents (
              application_id TEXT PRIMARY KEY,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS draft_revisions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              application_id TEXT NOT NULL REFERENCES drafts(application_id) ON DELETE CASCADE,
              revision INTEGER NOT NULL,
              base_package_id TEXT,
              label TEXT,
              template_revision TEXT NOT NULL,
              validation_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              actor TEXT NOT NULL,
              UNIQUE(application_id, revision)
            );
            CREATE TABLE IF NOT EXISTS draft_revision_files (
              draft_revision_id INTEGER NOT NULL REFERENCES draft_revisions(id) ON DELETE CASCADE,
              logical_path TEXT NOT NULL,
              artifact_sha256 TEXT NOT NULL REFERENCES artifacts(sha256),
              metadata_json TEXT NOT NULL,
              PRIMARY KEY(draft_revision_id, logical_path)
            );
            CREATE TABLE IF NOT EXISTS material_packages (
              id TEXT NOT NULL,
              application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
              source_draft_revision_id INTEGER NOT NULL REFERENCES draft_revisions(id),
              created_at TEXT NOT NULL,
              label TEXT,
              template_revision TEXT NOT NULL,
              deleted_at TEXT,
              PRIMARY KEY(application_id, id)
            );
            CREATE TABLE IF NOT EXISTS package_files (
              application_id TEXT NOT NULL,
              package_id TEXT NOT NULL,
              logical_path TEXT NOT NULL,
              artifact_sha256 TEXT NOT NULL REFERENCES artifacts(sha256),
              metadata_json TEXT NOT NULL,
              PRIMARY KEY(application_id, package_id, logical_path),
              FOREIGN KEY(application_id, package_id)
                REFERENCES material_packages(application_id, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS submissions (
              id TEXT NOT NULL,
              application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
              package_id TEXT,
              evidence_level TEXT NOT NULL CHECK(evidence_level IN ('exact_files','source_only','status_only')),
              submitted_at TEXT NOT NULL,
              recorded_at TEXT NOT NULL,
              channel TEXT NOT NULL,
              external_reference TEXT,
              note TEXT,
              PRIMARY KEY(application_id, id),
              FOREIGN KEY(application_id, package_id)
                REFERENCES material_packages(application_id, id)
            );
            CREATE TABLE IF NOT EXISTS submission_files (
              application_id TEXT NOT NULL,
              submission_id TEXT NOT NULL,
              logical_path TEXT NOT NULL,
              artifact_sha256 TEXT NOT NULL REFERENCES artifacts(sha256),
              metadata_json TEXT NOT NULL,
              PRIMARY KEY(application_id, submission_id, logical_path),
              FOREIGN KEY(application_id, submission_id)
                REFERENCES submissions(application_id, id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS operations (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('pending','committed','failed')),
              input_path TEXT,
              error TEXT,
              created_at TEXT NOT NULL,
              completed_at TEXT
            );
            INSERT INTO storage_meta(key, value) VALUES('schema_version', '2')
              ON CONFLICT(key) DO UPDATE SET value=excluded.value;
            """
        )
        package_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(material_packages)")
        }
        if "deleted_at" not in package_columns:
            connection.execute("ALTER TABLE material_packages ADD COLUMN deleted_at TEXT")
        connection.executescript(
            """
            CREATE TRIGGER IF NOT EXISTS immutable_profile_versions_update
              BEFORE UPDATE ON profile_versions BEGIN SELECT RAISE(ABORT,'profile version is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_profile_versions_delete
              BEFORE DELETE ON profile_versions BEGIN SELECT RAISE(ABORT,'profile version is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_preference_versions_update
              BEFORE UPDATE ON preference_versions BEGIN SELECT RAISE(ABORT,'preference version is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_preference_versions_delete
              BEFORE DELETE ON preference_versions BEGIN SELECT RAISE(ABORT,'preference version is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_job_versions_update
              BEFORE UPDATE ON job_versions BEGIN SELECT RAISE(ABORT,'job version is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_job_versions_delete
              BEFORE DELETE ON job_versions BEGIN SELECT RAISE(ABORT,'job version is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_job_evaluations_update
              BEFORE UPDATE ON job_evaluations BEGIN SELECT RAISE(ABORT,'job evaluation is append-only'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_job_evaluations_delete
              BEFORE DELETE ON job_evaluations BEGIN SELECT RAISE(ABORT,'job evaluation is append-only'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_draft_revisions_update
              BEFORE UPDATE ON draft_revisions BEGIN SELECT RAISE(ABORT,'draft revision is immutable'); END;
            -- The legacy system-owned revision 0 is an empty technical
            -- placeholder, not a material revision. Allow its cascade when
            -- an otherwise empty application shell is physically removed;
            -- every revision containing material or any later revision stays
            -- append-only.
            DROP TRIGGER IF EXISTS immutable_draft_revisions_delete;
            CREATE TRIGGER immutable_draft_revisions_delete
              BEFORE DELETE ON draft_revisions
              WHEN NOT (
                OLD.revision = 0
                AND OLD.actor = 'system'
                AND NOT EXISTS (
                  SELECT 1 FROM draft_revision_files f
                  WHERE f.draft_revision_id = OLD.id
                )
                AND EXISTS (
                  SELECT 1 FROM application_delete_intents i
                  WHERE i.application_id = OLD.application_id
                )
              )
              BEGIN SELECT RAISE(ABORT,'draft revision is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_draft_files_update
              BEFORE UPDATE ON draft_revision_files BEGIN SELECT RAISE(ABORT,'draft revision files are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_draft_files_delete
              BEFORE DELETE ON draft_revision_files BEGIN SELECT RAISE(ABORT,'draft revision files are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_package_update
              BEFORE UPDATE ON material_packages
              WHEN NOT (
                OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
                AND OLD.id=NEW.id AND OLD.application_id=NEW.application_id
                AND OLD.source_draft_revision_id=NEW.source_draft_revision_id
                AND OLD.created_at=NEW.created_at
                AND COALESCE(OLD.label,'')=COALESCE(NEW.label,'')
                AND OLD.template_revision=NEW.template_revision
              )
              BEGIN SELECT RAISE(ABORT,'material package is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS submitted_package_cannot_be_deleted
              BEFORE UPDATE OF deleted_at ON material_packages
              WHEN NEW.deleted_at IS NOT NULL AND EXISTS(
                SELECT 1 FROM submissions s
                WHERE s.application_id=OLD.application_id AND s.package_id=OLD.id
              )
              BEGIN SELECT RAISE(ABORT,'submitted material package is permanently locked'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_package_files_update
              BEFORE UPDATE ON package_files BEGIN SELECT RAISE(ABORT,'material package files are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_package_files_delete
              BEFORE DELETE ON package_files BEGIN SELECT RAISE(ABORT,'material package files are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_submissions_update
              BEFORE UPDATE ON submissions BEGIN SELECT RAISE(ABORT,'submission is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_submissions_delete
              BEFORE DELETE ON submissions BEGIN SELECT RAISE(ABORT,'submission is immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_submission_files_update
              BEFORE UPDATE ON submission_files BEGIN SELECT RAISE(ABORT,'submission files are immutable'); END;
            CREATE TRIGGER IF NOT EXISTS immutable_submission_files_delete
              BEFORE DELETE ON submission_files BEGIN SELECT RAISE(ABORT,'submission files are immutable'); END;
            """
        )

    def _ensure_defaults(self, connection: sqlite3.Connection) -> None:
        if connection.execute("SELECT 1 FROM workspace_state WHERE singleton=1").fetchone():
            connection.execute(
                "UPDATE jobs SET status='applied' WHERE id IN "
                "(SELECT source_job_id FROM applications WHERE source_job_id IS NOT NULL)"
            )
            return
        created = now_iso()
        profile = {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "identity": {},
            "contact": {},
            "summary": "",
            "experience": [],
            "education": [],
            "skills": [],
            "languages": [],
            "evidence": [],
        }
        preferences = {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "target_roles": [],
            "target_domains": [],
            "locations": [],
            "work_style": {},
            "compensation": {},
            "hard_constraints": [],
            "soft_preferences": [],
            "blacklisted_companies": [],
        }
        profile_id = connection.execute(
            "INSERT INTO profile_versions(version,payload_json,payload_sha256,created_at,actor) VALUES(1,?,?,?,?)",
            (canonical_json(profile), json_hash(profile), created, "system"),
        ).lastrowid
        preference_id = connection.execute(
            "INSERT INTO preference_versions(version,payload_json,payload_sha256,created_at,actor) VALUES(1,?,?,?,?)",
            (canonical_json(preferences), json_hash(preferences), created, "system"),
        ).lastrowid
        connection.execute(
            "INSERT INTO workspace_state VALUES(1,?,?,?,?)",
            (profile_id, preference_id, created, created),
        )

__all__ = ["StorageDatabase"]
