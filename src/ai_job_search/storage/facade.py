"""Composed Storage-v2 service exposed to the CLI and Web layers."""

from __future__ import annotations

from .applications import ApplicationStorageMixin
from .artifacts import ArtifactStorageMixin
from .drafts import DraftStorageMixin
from .integrity import IntegrityStorageMixin
from .jobs import JobStorageMixin
from .packages import PackageStorageMixin
from .profile import ProfileStorageMixin


class WorkspaceV2(
    ArtifactStorageMixin,
    ProfileStorageMixin,
    JobStorageMixin,
    ApplicationStorageMixin,
    DraftStorageMixin,
    PackageStorageMixin,
    IntegrityStorageMixin,
):
    """Storage-v2 facade composed from infrastructure and domain services.

    The mixins contain domain operations, while ``StorageDatabase`` (their
    shared base) owns the connection, schema, and initialization boundary.
    Domain modules depend only on that base and shared contracts;
    they do not import this facade or one another.
    """


__all__ = ["WorkspaceV2"]
