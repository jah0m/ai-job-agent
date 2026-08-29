"""Storage-v2 implementation package.

Import the service through :mod:`ai_job_search.workspace` for public API
compatibility. This package is also the stable internal boundary used by the
domain-specific storage mixins.
"""

from .common import (
    ALLOWED_DELIVERABLE_EXTENSIONS,
    DEFAULT_STATUS,
    DOMAIN_SCHEMA_VERSION,
    MAX_DELIVERABLE_BYTES,
    STORAGE_SCHEMA_VERSION,
    VALID_ARTIFACT_ORIGINS,
    VALID_ARTIFACT_PURPOSES,
    VALID_ARTIFACT_ROLES,
    VALID_CONSTRAINT_RESULTS,
    VALID_EVALUATION_CONFIDENCE,
    VALID_EVIDENCE_LEVELS,
    VALID_JOB_RECOMMENDATIONS,
    VALID_JOB_STATUSES,
    VALID_STATUSES,
    VALID_SUBMISSION_CHANNELS,
    WorkspaceError,
    canonical_json,
    json_hash,
    json_read,
    json_write,
    now_iso,
    sha256_file,
    slugify,
    timestamp_id,
)
from .facade import WorkspaceV2
from .objects import ObjectStore

__all__ = [
    "ALLOWED_DELIVERABLE_EXTENSIONS",
    "DEFAULT_STATUS",
    "DOMAIN_SCHEMA_VERSION",
    "MAX_DELIVERABLE_BYTES",
    "ObjectStore",
    "STORAGE_SCHEMA_VERSION",
    "VALID_ARTIFACT_ORIGINS",
    "VALID_ARTIFACT_PURPOSES",
    "VALID_ARTIFACT_ROLES",
    "VALID_CONSTRAINT_RESULTS",
    "VALID_EVALUATION_CONFIDENCE",
    "VALID_EVIDENCE_LEVELS",
    "VALID_JOB_RECOMMENDATIONS",
    "VALID_JOB_STATUSES",
    "VALID_STATUSES",
    "VALID_SUBMISSION_CHANNELS",
    "WorkspaceError",
    "WorkspaceV2",
    "canonical_json",
    "json_hash",
    "json_read",
    "json_write",
    "now_iso",
    "sha256_file",
    "slugify",
    "timestamp_id",
]
