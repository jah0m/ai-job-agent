from __future__ import annotations

import hashlib
import json
from datetime import datetime
from importlib.resources import files
from pathlib import Path
from typing import Any, cast

from jsonschema import Draft202012Validator, FormatChecker


class JobContractError(ValueError):
    """Raised when an AI-normalized job crosses the import boundary invalidly."""


def _load_schema() -> dict[str, Any]:
    resource = files("ai_job_search.schemas").joinpath("job-result.schema.json")
    return cast(dict[str, Any], json.loads(resource.read_text(encoding="utf-8")))


JOB_RESULT_SCHEMA = _load_schema()
Draft202012Validator.check_schema(JOB_RESULT_SCHEMA)
JOB_RESULT_VALIDATOR = Draft202012Validator(
    JOB_RESULT_SCHEMA,
    format_checker=FormatChecker(),
)


def _json_path(parts: Any) -> str:
    path = "$"
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        else:
            path += f".{part}"
    return path


def validate_job_shape(job: Any) -> dict[str, Any]:
    """Validate one normalized job against the packaged JSON Schema."""
    errors = sorted(
        JOB_RESULT_VALIDATOR.iter_errors(job),
        key=lambda error: tuple(str(part) for part in error.absolute_path),
    )
    if errors:
        details = "; ".join(
            f"{_json_path(error.absolute_path)}: {error.message}" for error in errors
        )
        raise JobContractError(f"Invalid normalized job: {details}")

    def reject_blank_strings(value: Any, path: str) -> None:
        if isinstance(value, str) and not value.strip():
            raise JobContractError(
                f"Invalid normalized job at {path}: blank strings are not allowed"
            )
        if isinstance(value, dict):
            for key, child in value.items():
                reject_blank_strings(child, f"{path}.{key}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                reject_blank_strings(child, f"{path}[{index}]")

    reject_blank_strings(job, "$")
    return cast(dict[str, Any], job)


def validate_job_semantics(
    job: dict[str, Any],
    *,
    portal: str,
    workspace_root: Path,
    canonical_url: str,
    canonical_detail_url: str,
) -> Path:
    """Validate provenance and cross-field rules JSON Schema cannot express."""
    source = job["source"]
    if source["provider"].strip().lower() != portal:
        raise JobContractError(
            "Invalid normalized job at $.source.provider: "
            f"expected {portal!r}, got {source['provider']!r}"
        )
    if canonical_detail_url != canonical_url:
        raise JobContractError(
            "Invalid normalized job at $.source.detail_url: must identify the same "
            "canonical public detail page as $.url"
        )

    try:
        retrieved_at = datetime.fromisoformat(source["retrieved_at"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise JobContractError(
            "Invalid normalized job at $.source.retrieved_at: invalid ISO 8601 timestamp"
        ) from exc
    if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
        raise JobContractError(
            "Invalid normalized job at $.source.retrieved_at: timezone is required"
        )

    raw_path = Path(source["snapshot_path"])
    if raw_path.is_absolute():
        raise JobContractError(
            "Invalid normalized job at $.source.snapshot_path: use a portable relative path"
        )
    if raw_path.parts and raw_path.parts[0] == workspace_root.name:
        snapshot_path = (workspace_root.parent / raw_path).resolve()
    else:
        snapshot_path = (workspace_root / raw_path).resolve()
    staging_roots = [
        (workspace_root / "cache").resolve(),
        (workspace_root / "operations").resolve(),
    ]
    if not any(_is_relative_to(snapshot_path, staging_root) for staging_root in staging_roots):
        raise JobContractError(
            "Invalid normalized job at $.source.snapshot_path: snapshot must be under "
            f"{staging_roots[0]} or {staging_roots[1]}"
        )
    if not snapshot_path.is_file():
        raise JobContractError(
            "Invalid normalized job at $.source.snapshot_path: snapshot file does not exist"
        )
    digest = hashlib.sha256()
    with snapshot_path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != source["snapshot_sha256"]:
        raise JobContractError(
            "Invalid normalized job at $.source.snapshot_sha256: snapshot hash does not match"
        )

    salary = job.get("salary")
    if isinstance(salary, dict):
        minimum = salary.get("annual_minimum")
        maximum = salary.get("annual_maximum")
        if minimum is not None and maximum is not None and maximum < minimum:
            raise JobContractError(
                "Invalid normalized job at $.salary.annual_maximum: must be greater "
                "than or equal to annual_minimum"
            )

    work_style = job.get("work_style")
    if isinstance(work_style, dict) and work_style["remote"] in {"remote", "unknown"}:
        if "office_days_per_week" in work_style:
            raise JobContractError(
                "Invalid normalized job at $.work_style.office_days_per_week: omit it "
                "when remote is 'remote' or 'unknown'"
            )

    for field_name in job.get("field_evidence", {}):
        if field_name not in job:
            raise JobContractError(
                f"Invalid normalized job at $.field_evidence.{field_name}: "
                "evidence cannot refer to an omitted field"
            )

    return snapshot_path


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False
