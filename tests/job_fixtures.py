from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any


def normalized_job(
    workspace_root: Path,
    *,
    provider: str,
    url: str,
    title: str = "Backend Engineer",
    external_id: str = "job-1",
    **facts: Any,
) -> dict[str, Any]:
    cache = workspace_root / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    snapshot = cache / f"{provider}-{external_id.replace('/', '-')}.html"
    content = f"<html><h1>{title}</h1><p>Public job detail evidence.</p></html>"
    snapshot.write_text(content, encoding="utf-8")
    digest = hashlib.sha256(snapshot.read_bytes()).hexdigest()
    return {
        "schema_version": 2,
        "external_id": external_id,
        "title": title,
        "url": url,
        "source": {
            "provider": provider,
            "detail_url": url,
            "retrieved_at": "2026-08-29T12:00:00+09:00",
            "snapshot_path": f"cache/{snapshot.name}",
            "snapshot_sha256": digest,
            "retriever": f"{provider}-search/test",
        },
        **facts,
    }
