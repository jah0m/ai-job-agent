"""Versioned candidate profile and job-search preference state."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .common import DOMAIN_SCHEMA_VERSION, WorkspaceError, canonical_json, now_iso
from .database import StorageDatabase


class ProfileStorageMixin(StorageDatabase):
    """Persist profile and preference updates as immutable versions."""

    def show_candidate_profile(self) -> dict[str, Any]:
        self.require_initialized()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT p.payload_json FROM workspace_state w "
                "JOIN profile_versions p ON p.id=w.current_profile_version_id WHERE w.singleton=1"
            ).fetchone()
        if row is None:
            raise WorkspaceError("Workspace profile state is missing")
        result = json.loads(row["payload_json"])
        if not isinstance(result, dict):
            raise WorkspaceError("Workspace profile state is not a JSON object")
        return result

    def show_preferences(self) -> dict[str, Any]:
        self.require_initialized()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT p.payload_json FROM workspace_state w "
                "JOIN preference_versions p ON p.id=w.current_preference_version_id WHERE w.singleton=1"
            ).fetchone()
        if row is None:
            raise WorkspaceError("Workspace preference state is missing")
        result = json.loads(row["payload_json"])
        if not isinstance(result, dict):
            raise WorkspaceError("Workspace preference state is not a JSON object")
        result.setdefault("blacklisted_companies", [])
        return result

    @staticmethod
    def _validate_profile(profile: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(profile, dict):
            raise WorkspaceError("Candidate profile must be a JSON object")
        for key in ("identity", "contact"):
            if not isinstance(profile.get(key), dict):
                raise WorkspaceError(f"Candidate profile {key} must be an object")
        if not isinstance(profile.get("summary"), str):
            raise WorkspaceError("Candidate profile summary must be a string")
        for key in ("experience", "education", "languages", "evidence"):
            if not isinstance(profile.get(key), list) or not all(
                isinstance(item, dict) for item in profile[key]
            ):
                raise WorkspaceError(f"Candidate profile {key} entries must be objects")
        if not isinstance(profile.get("skills"), list):
            raise WorkspaceError("Candidate profile skills must be a list")
        if not all(isinstance(item, str) for item in profile["skills"]):
            raise WorkspaceError("Candidate profile skills entries must be strings")
        result = dict(profile)
        result["schema_version"] = DOMAIN_SCHEMA_VERSION
        return result

    @staticmethod
    def _validate_preferences(preferences: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(preferences, dict):
            raise WorkspaceError("Preferences must be a JSON object")
        result = dict(preferences)
        for key in (
            "target_roles",
            "target_domains",
            "locations",
            "hard_constraints",
            "soft_preferences",
            "blacklisted_companies",
        ):
            if key == "blacklisted_companies":
                result.setdefault(key, [])
            if not isinstance(result.get(key), list):
                raise WorkspaceError(f"Preferences {key} must be a list")
            if not all(isinstance(item, str) for item in result[key]):
                raise WorkspaceError(f"Preferences {key} entries must be strings")
        for key in ("work_style", "compensation"):
            if not isinstance(result.get(key), dict):
                raise WorkspaceError(f"Preferences {key} must be an object")
        for key in ("remote_preferred", "autonomy_preferred", "focus_time_preferred"):
            if key in result["work_style"] and not isinstance(result["work_style"][key], bool):
                raise WorkspaceError(f"Preferences work_style.{key} must be a boolean")
        office_days = result["work_style"].get("maximum_office_days_per_week")
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
        compensation = result["compensation"]
        if "currency" in compensation and not isinstance(compensation["currency"], str):
            raise WorkspaceError("Preferences compensation.currency must be a string")
        for key in ("minimum", "target"):
            value = compensation.get(key)
            if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
                raise WorkspaceError(f"Preferences compensation.{key} must be an integer or null")
        result["schema_version"] = DOMAIN_SCHEMA_VERSION
        return result

    def _append_version(
        self,
        table: str,
        state_column: str,
        payload: dict[str, Any],
        actor: str,
    ) -> dict[str, Any]:
        encoded = canonical_json(payload)
        digest = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
        created = now_iso()
        with self.connect() as connection:
            existing = connection.execute(
                f"SELECT id FROM {table} WHERE payload_sha256=?", (digest,)
            ).fetchone()
            if existing is not None:
                connection.execute(
                    f"UPDATE workspace_state SET {state_column}=?, updated_at=? WHERE singleton=1",
                    (existing["id"], created),
                )
                return payload
            current = connection.execute(
                f"SELECT COALESCE(MAX(version),0) AS version FROM {table}"
            ).fetchone()
            if current is None:
                raise WorkspaceError(f"Unable to read current version from {table}")
            cursor = connection.execute(
                f"INSERT INTO {table}(version,payload_json,payload_sha256,created_at,actor) VALUES(?,?,?,?,?)",
                (int(current["version"]) + 1, encoded, digest, created, actor),
            )
            connection.execute(
                f"UPDATE workspace_state SET {state_column}=?, updated_at=? WHERE singleton=1",
                (cursor.lastrowid, created),
            )
        return payload

    def update_candidate_profile(
        self, profile: dict[str, Any], *, actor: str = "user"
    ) -> dict[str, Any]:
        self.require_initialized()
        return self._append_version(
            "profile_versions",
            "current_profile_version_id",
            self._validate_profile(profile),
            actor,
        )

    def update_preferences(
        self, preferences: dict[str, Any], *, actor: str = "user"
    ) -> dict[str, Any]:
        self.require_initialized()
        return self._append_version(
            "preference_versions",
            "current_preference_version_id",
            self._validate_preferences(preferences),
            actor,
        )


__all__ = ["ProfileStorageMixin"]
