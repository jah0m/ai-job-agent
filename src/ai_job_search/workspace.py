"""Public storage facade.

All active persistence is implemented by Storage v2. The stable imports in this
module keep CLI, Web, and third-party callers independent from the internal
module layout.
"""

from .storage_v2 import (
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
    VALID_STATUSES,
    VALID_SUBMISSION_CHANNELS,
    ObjectStore,
    WorkspaceError,
    WorkspaceV2,
    canonical_json,
    json_hash,
    now_iso,
    sha256_file,
    slugify,
    timestamp_id,
)

SCHEMA_VERSION = DOMAIN_SCHEMA_VERSION
Workspace = WorkspaceV2


__all__ = [
    "ALLOWED_DELIVERABLE_EXTENSIONS",
    "DEFAULT_STATUS",
    "MAX_DELIVERABLE_BYTES",
    "ObjectStore",
    "SCHEMA_VERSION",
    "STORAGE_SCHEMA_VERSION",
    "VALID_ARTIFACT_ORIGINS",
    "VALID_ARTIFACT_PURPOSES",
    "VALID_ARTIFACT_ROLES",
    "VALID_CONSTRAINT_RESULTS",
    "VALID_EVALUATION_CONFIDENCE",
    "VALID_EVIDENCE_LEVELS",
    "VALID_JOB_RECOMMENDATIONS",
    "VALID_STATUSES",
    "VALID_SUBMISSION_CHANNELS",
    "Workspace",
    "WorkspaceError",
    "canonical_json",
    "json_hash",
    "now_iso",
    "sha256_file",
    "slugify",
    "timestamp_id",
]
