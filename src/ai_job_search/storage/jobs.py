"""Discovered-job ingestion, review, and versioned AI evaluations."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

from ..job_contract import JobContractError, validate_job_semantics, validate_job_shape
from .common import (
    DOMAIN_SCHEMA_VERSION,
    VALID_CONSTRAINT_RESULTS,
    VALID_EVALUATION_CONFIDENCE,
    VALID_JOB_RECOMMENDATIONS,
    VALID_JOB_STATUSES,
    WorkspaceError,
    canonical_json,
    json_hash,
    now_iso,
    sha256_file,
    slugify,
)
from .database import StorageDatabase


class JobStorageMixin(StorageDatabase):
    """Own the normalized job and evaluation lifecycle."""

    def import_jobs(
        self,
        *,
        portal: str,
        source_file: str | Path,
        validate_only: bool = False,
        consume: bool = True,
    ) -> dict[str, Any]:
        self.require_initialized()
        provider = slugify(portal)
        source = Path(source_file).expanduser().resolve()
        payload = _read_json(source)
        results = (
            payload
            if isinstance(payload, list)
            else [payload]
            if isinstance(payload, dict)
            else None
        )
        if not results:
            raise WorkspaceError(
                "Normalized job import JSON must contain one object or a non-empty list"
            )

        prepared: list[dict[str, Any]] = []
        identities: set[tuple[str, str]] = set()
        for index, raw in enumerate(results):
            try:
                validate_job_shape(raw)
                url = self._canonical_url(raw["url"])
                detail_url = self._canonical_url(raw["source"]["detail_url"])
                snapshot = validate_job_semantics(
                    raw,
                    portal=provider,
                    workspace_root=self.root,
                    canonical_url=url,
                    canonical_detail_url=detail_url,
                )
            except (JobContractError, WorkspaceError) as exc:
                raise WorkspaceError(f"Job import item {index}: {exc}") from exc
            external_id = raw.get("external_id")
            identity = (provider, external_id or url)
            if identity in identities:
                raise WorkspaceError(
                    f"Job import item {index}: duplicate listing identity in the same batch"
                )
            identities.add(identity)
            digest = sha256_file(snapshot)
            size = snapshot.stat().st_size
            if digest != raw["source"]["snapshot_sha256"]:
                raise WorkspaceError(f"Job import item {index}: source artifact hash changed")
            prepared.append(
                {
                    "raw": raw,
                    "url": url,
                    "external_id": external_id,
                    "snapshot": snapshot,
                    "source_digest": digest,
                    "source_size": size,
                }
            )

        if validate_only:
            return {
                "portal": provider,
                "valid": True,
                "jobs": len(prepared),
                "source_file": str(source),
            }

        for item in prepared:
            stored_digest, stored_size, _ = self.objects.put_file(item["snapshot"])
            if stored_digest != item["source_digest"] or stored_size != item["source_size"]:
                raise WorkspaceError("Job source snapshot changed after validation")

        imported = 0
        updated = 0
        seen_at = now_iso()
        with self.connect() as connection:
            for item in prepared:
                raw = item["raw"]
                external_id = item["external_id"]
                stable_source = f"{provider}\0{external_id or item['url']}"
                proposed_id = (
                    f"{provider}-{hashlib.sha256(stable_source.encode('utf-8')).hexdigest()[:16]}"
                )
                existing = connection.execute(
                    "SELECT id FROM jobs WHERE portal=? AND (canonical_url=? OR "
                    "(? IS NOT NULL AND external_id=?))",
                    (provider, item["url"], external_id, external_id),
                ).fetchone()
                job_id = existing["id"] if existing else proposed_id
                if existing:
                    connection.execute(
                        "UPDATE jobs SET external_id=?,canonical_url=?,last_seen_at=? WHERE id=?",
                        (external_id, item["url"], seen_at, job_id),
                    )
                    updated += 1
                else:
                    connection.execute(
                        "INSERT INTO jobs(id,portal,external_id,canonical_url,status,first_seen_at,last_seen_at) "
                        "VALUES(?,?,?,?,'new',?,?)",
                        (job_id, provider, external_id, item["url"], seen_at, seen_at),
                    )
                    imported += 1
                self._register_artifact(
                    connection,
                    item["source_digest"],
                    item["source_size"],
                    self._media_type(item["snapshot"]),
                    item["snapshot"].name,
                )
                normalized_sha = json_hash(raw)
                version = connection.execute(
                    "SELECT id FROM job_versions WHERE job_id=? AND normalized_sha256=? "
                    "AND source_artifact_sha256=?",
                    (job_id, normalized_sha, item["source_digest"]),
                ).fetchone()
                if version is None:
                    version_id = connection.execute(
                        "INSERT INTO job_versions(job_id,schema_version,normalized_json,normalized_sha256,"
                        "source_artifact_sha256,retrieved_at,created_at) VALUES(?,?,?,?,?,?,?)",
                        (
                            job_id,
                            int(raw["schema_version"]),
                            canonical_json(raw),
                            normalized_sha,
                            item["source_digest"],
                            raw["source"]["retrieved_at"],
                            seen_at,
                        ),
                    ).lastrowid
                else:
                    version_id = version["id"]
                connection.execute(
                    "UPDATE jobs SET current_version_id=? WHERE id=?", (version_id, job_id)
                )

        if consume and self._is_staging_path(source):
            self.consume_staging_file(source)
            for snapshot in {item["snapshot"] for item in prepared}:
                self.consume_staging_file(snapshot)
        return {"portal": provider, "imported": imported, "updated": updated, "skipped": 0}

    @staticmethod
    def _job_select() -> str:
        return (
            "SELECT j.id,j.portal,j.external_id,j.canonical_url AS url,j.status,j.rating,j.notes,"
            "j.first_seen_at,j.last_seen_at,j.current_version_id,v.normalized_json "
            "FROM jobs j JOIN job_versions v ON v.id=j.current_version_id"
        )

    @staticmethod
    def _job_row(row: sqlite3.Row, *, include_raw: bool = False) -> dict[str, Any]:
        raw = json.loads(row["normalized_json"])
        result: dict[str, Any] = {
            "id": row["id"],
            "portal": row["portal"],
            "external_id": row["external_id"],
            "title": raw["title"],
            "company": raw.get("company"),
            "location": raw.get("location"),
            "url": row["url"],
            "posted_at": raw.get("posted_at"),
            "status": row["status"],
            "first_seen_at": row["first_seen_at"],
            "last_seen_at": row["last_seen_at"],
        }
        if "rating" in row.keys():
            result.update({"rating": row["rating"], "notes": row["notes"]})
        if include_raw:
            result["raw"] = raw
            result["version_id"] = row["current_version_id"]
        return result

    def list_jobs(self, *, status: str | None = None) -> list[dict[str, Any]]:
        self.require_initialized()
        query = self._job_select()
        values: tuple[Any, ...] = ()
        if status:
            query += " WHERE j.status=?"
            values = (status,)
        query += " ORDER BY j.last_seen_at DESC,j.id"
        with self.connect() as connection:
            rows = connection.execute(query, values).fetchall()
        return [self._job_row(row) for row in rows]

    def show_job(self, job_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(self._job_select() + " WHERE j.id=?", (job_id,)).fetchone()
        if row is None:
            raise WorkspaceError(f"Unknown discovered job: {job_id}")
        return self._job_row(row, include_raw=True)

    def list_jobs_for_dashboard(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                self._job_select() + " ORDER BY j.last_seen_at DESC,j.id"
            ).fetchall()
            result: list[dict[str, Any]] = []
            for row in rows:
                item = self._job_row(row, include_raw=True)
                application = connection.execute(
                    "SELECT status FROM applications WHERE source_job_id=?", (row["id"],)
                ).fetchone()
                item["application_status"] = application["status"] if application else None
                evaluation = connection.execute(
                    "SELECT payload_json FROM job_evaluations WHERE job_id=? ORDER BY id DESC LIMIT 1",
                    (row["id"],),
                ).fetchone()
                item["evaluation"] = json.loads(evaluation["payload_json"]) if evaluation else None
                result.append(item)
        return result

    def update_job_status(self, job_id: str, *, status: str) -> dict[str, Any]:
        if status not in VALID_JOB_STATUSES:
            raise WorkspaceError(f"Invalid discovered-job status: {status}")
        with self.connect() as connection:
            row = connection.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
            if row is None:
                raise WorkspaceError(f"Unknown discovered job: {job_id}")
            linked = connection.execute(
                "SELECT 1 FROM applications WHERE source_job_id=?", (job_id,)
            ).fetchone()
            if (row["status"] == "applied" or linked is not None) and status != "applied":
                raise WorkspaceError("Applied jobs cannot change back to a pre-application status")
            connection.execute("UPDATE jobs SET status=? WHERE id=?", (status, job_id))
        return {"job_id": job_id, "status": status}

    def update_job_review(self, job_id: str, *, rating: int | None, notes: str) -> dict[str, Any]:
        if rating is not None and rating not in range(1, 6):
            raise WorkspaceError("Job rating must be between 1 and 5")
        with self.connect() as connection:
            result = connection.execute(
                "UPDATE jobs SET rating=?,notes=? WHERE id=?", (rating, notes, job_id)
            )
            if result.rowcount != 1:
                raise WorkspaceError(f"Unknown discovered job: {job_id}")
        return {"job_id": job_id, "rating": rating, "notes": notes}

    @staticmethod
    def _validate_job_evaluation(evaluation: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(evaluation, dict):
            raise WorkspaceError("Job evaluation must be a JSON object")
        if evaluation.get("schema_version") != DOMAIN_SCHEMA_VERSION:
            raise WorkspaceError(f"Job evaluation schema_version must be {DOMAIN_SCHEMA_VERSION}")
        recommendation = evaluation.get("recommendation")
        if recommendation not in VALID_JOB_RECOMMENDATIONS:
            raise WorkspaceError(
                "Job evaluation recommendation must be one of: consider, pursue, skip"
            )
        summary = evaluation.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            raise WorkspaceError("Job evaluation summary must be a non-empty string")
        for key in ("strengths", "questions"):
            values = evaluation.get(key)
            if not isinstance(values, list) or any(
                not isinstance(x, str) or not x.strip() for x in values
            ):
                raise WorkspaceError(f"Job evaluation {key} must be a list of strings")
        gaps = evaluation.get("gaps")
        if not isinstance(gaps, dict):
            raise WorkspaceError("Job evaluation gaps must be an object")
        for key in ("disqualifying", "learnable", "unclear"):
            values = gaps.get(key)
            if not isinstance(values, list) or any(
                not isinstance(x, str) or not x.strip() for x in values
            ):
                raise WorkspaceError(f"Job evaluation gaps.{key} must be a list of strings")
        constraints = evaluation.get("hard_constraints")
        if (
            not isinstance(constraints, dict)
            or constraints.get("result") not in VALID_CONSTRAINT_RESULTS
        ):
            raise WorkspaceError("hard_constraints.result must be one of: fail, pass, unclear")
        reasons = constraints.get("reasons")
        if not isinstance(reasons, list) or any(
            not isinstance(x, str) or not x.strip() for x in reasons
        ):
            raise WorkspaceError("hard_constraints.reasons must be a list of strings")
        confidence = evaluation.get("confidence")
        if confidence not in VALID_EVALUATION_CONFIDENCE:
            raise WorkspaceError("Job evaluation confidence must be one of: high, low, medium")
        limitations = evaluation.get("source_limitations")
        if not isinstance(limitations, str):
            raise WorkspaceError("Job evaluation source_limitations must be a string")
        return {
            "schema_version": DOMAIN_SCHEMA_VERSION,
            "recommendation": recommendation,
            "summary": summary.strip(),
            "strengths": [x.strip() for x in evaluation["strengths"]],
            "gaps": {
                key: [x.strip() for x in gaps[key]]
                for key in ("disqualifying", "learnable", "unclear")
            },
            "questions": [x.strip() for x in evaluation["questions"]],
            "hard_constraints": {
                "result": constraints["result"],
                "reasons": [x.strip() for x in reasons],
            },
            "confidence": confidence,
            "source_limitations": limitations.strip(),
        }

    def record_job_evaluation(
        self,
        job_id: str,
        evaluation: dict[str, Any],
        *,
        analyzed_at: str | None = None,
    ) -> dict[str, Any]:
        normalized = self._validate_job_evaluation(evaluation)
        timestamp = analyzed_at or now_iso()
        with self.connect() as connection:
            job = connection.execute(
                "SELECT current_version_id FROM jobs WHERE id=?", (job_id,)
            ).fetchone()
            state = connection.execute("SELECT * FROM workspace_state WHERE singleton=1").fetchone()
            if job is None:
                raise WorkspaceError(f"Unknown discovered job: {job_id}")
            if state is None:
                raise WorkspaceError("Workspace state is missing")
            cursor = connection.execute(
                "INSERT INTO job_evaluations(job_id,job_version_id,profile_version_id,preference_version_id,"
                "analyzed_at,recommendation,payload_json) VALUES(?,?,?,?,?,?,?)",
                (
                    job_id,
                    job["current_version_id"],
                    state["current_profile_version_id"],
                    state["current_preference_version_id"],
                    timestamp,
                    normalized["recommendation"],
                    canonical_json(normalized),
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
        with self.connect() as connection:
            job = connection.execute(
                "SELECT current_version_id FROM jobs WHERE id=?", (job_id,)
            ).fetchone()
            if job is None:
                raise WorkspaceError(f"Unknown discovered job: {job_id}")
            state = connection.execute("SELECT * FROM workspace_state WHERE singleton=1").fetchone()
            if state is None:
                raise WorkspaceError("Workspace state is missing")
            row = connection.execute(
                "SELECT * FROM job_evaluations WHERE job_id=? ORDER BY id DESC LIMIT 1", (job_id,)
            ).fetchone()
        if row is None:
            return None
        reasons: list[str] = []
        if row["profile_version_id"] != state["current_profile_version_id"]:
            reasons.append("个人履历已在分析后更新")
        if row["preference_version_id"] != state["current_preference_version_id"]:
            reasons.append("求职偏好已在分析后更新")
        if row["job_version_id"] != job["current_version_id"]:
            reasons.append("职位信息已在分析后更新")
        return {
            "id": row["id"],
            "job_id": job_id,
            "analyzed_at": row["analyzed_at"],
            **json.loads(row["payload_json"]),
            "stale": bool(reasons),
            "stale_reasons": reasons,
        }


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkspaceError(f"Missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkspaceError(f"Invalid JSON in {path}: {exc}") from exc


__all__ = ["JobStorageMixin"]
