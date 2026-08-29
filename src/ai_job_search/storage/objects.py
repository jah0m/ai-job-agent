"""Immutable SHA-256 content-addressed object storage."""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

from .common import WorkspaceError, sha256_file


class ObjectStore:
    """Store bytes once, verify them, and address them by SHA-256."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.temporary_root = self.root.parents[1] / "operations" / ".objects"

    def initialize(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.temporary_root.mkdir(parents=True, exist_ok=True)

    def path_for(self, digest: str) -> Path:
        if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            raise WorkspaceError(f"Invalid artifact SHA-256: {digest!r}")
        return self.root / digest[:2] / digest[2:]

    def put_bytes(self, content: bytes) -> tuple[str, int, Path]:
        digest = hashlib.sha256(content).hexdigest()
        destination = self.path_for(digest)
        if destination.exists():
            if destination.stat().st_size != len(content) or sha256_file(destination) != digest:
                raise WorkspaceError(f"Corrupt content-addressed object: {digest}")
            return digest, len(content), destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix="object-", dir=self.temporary_root)
        temporary = Path(name)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                temporary.replace(destination)
            except FileExistsError:
                pass
        finally:
            temporary.unlink(missing_ok=True)
        if sha256_file(destination) != digest:
            raise WorkspaceError(f"Artifact failed post-write verification: {digest}")
        return digest, len(content), destination

    def put_file(self, source: Path) -> tuple[str, int, Path]:
        source = source.expanduser().resolve()
        if not source.is_file() or source.is_symlink():
            raise WorkspaceError(f"Artifact source is not a regular file: {source}")
        return self.put_bytes(source.read_bytes())

    def verify(self, digest: str, expected_size: int) -> str | None:
        path = self.path_for(digest)
        if not path.is_file():
            return f"missing object {digest}"
        if path.stat().st_size != expected_size:
            return f"size mismatch object {digest}"
        if sha256_file(path) != digest:
            return f"hash mismatch object {digest}"
        return None


__all__ = ["ObjectStore"]
