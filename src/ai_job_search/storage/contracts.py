"""Narrow internal port shared by the composed Storage-v2 domain services."""

from __future__ import annotations

import sqlite3
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Any, Protocol

from .objects import ObjectStore


class StorageDomainPort(Protocol):
    """Internal collaboration surface for the composed domain mixins.

    ``StorageDatabase`` inherits this protocol so each mixin is checked
    against the same explicit collaboration surface without importing the
    facade or another domain module.
    """

    root: Path
    objects: ObjectStore

    def connect(
        self, *, require_initialized: bool = True
    ) -> AbstractContextManager[sqlite3.Connection]: ...

    def update_candidate_profile(
        self, profile: dict[str, Any], *, actor: str = "user"
    ) -> dict[str, Any]: ...

    def update_preferences(
        self, preferences: dict[str, Any], *, actor: str = "user"
    ) -> dict[str, Any]: ...

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
    ) -> dict[str, Any]: ...

    @staticmethod
    def _media_type(path: Path) -> str: ...

    @staticmethod
    def _register_artifact(
        connection: sqlite3.Connection,
        digest: str,
        size: int,
        media_type: str,
        original_filename: str | None,
    ) -> None: ...

    def _put_entry(
        self,
        logical_path: str,
        *,
        source: Path | None = None,
        payload: bytes | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    def _validate_file_map(self, entries: dict[str, dict[str, Any]]) -> dict[str, Any]: ...

    def audit(self) -> dict[str, Any]: ...

    @staticmethod
    def _canonical_url(value: str) -> str: ...

    def _is_staging_path(self, path: Path) -> bool: ...

    def consume_staging_file(self, path: str | Path) -> bool: ...

    @staticmethod
    def _is_below(path: Path, root: Path) -> bool: ...

    def _artifact_relative_path(self, digest: str) -> str: ...

    @staticmethod
    def _entry_from_row(row: sqlite3.Row) -> dict[str, Any]: ...

    def _package_rows(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        package_id: str,
    ) -> list[sqlite3.Row]: ...

    def _draft_rows(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        revision: int | None = None,
    ) -> list[sqlite3.Row]: ...

    def _current_draft(
        self, connection: sqlite3.Connection, application_id: str
    ) -> tuple[sqlite3.Row, sqlite3.Row | dict[str, Any]]: ...

    def _application_row(self, application_id: str) -> sqlite3.Row: ...

    def _add_event(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        event_type: str,
        data: dict[str, Any],
    ) -> None: ...

    def _submission_files(
        self,
        connection: sqlite3.Connection,
        application_id: str,
        submission_id: str,
    ) -> list[dict[str, Any]]: ...

    def show_draft(self, application_id: str) -> dict[str, Any]: ...

    def list_packages(self, application_id: str) -> list[dict[str, Any]]: ...

    def package_files(self, application_id: str, package_id: str) -> list[dict[str, Any]]: ...

    def show_job(self, job_id: str) -> dict[str, Any]: ...

    def list_jobs(self, *, status: str | None = None) -> list[dict[str, Any]]: ...

    def show_candidate_profile(self) -> dict[str, Any]: ...

    def show_preferences(self) -> dict[str, Any]: ...

    def list_applications(self) -> list[dict[str, Any]]: ...

    def show_application(self, application_id: str) -> dict[str, Any]: ...

    def delete_application(self, application_id: str) -> dict[str, Any]: ...


__all__ = ["StorageDomainPort"]
