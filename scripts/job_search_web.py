"""Start the private AI Job Agent dashboard on localhost."""

from __future__ import annotations

import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY_ROOT / "src"))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "ai_job_search.web:create_app",
        host="::1",
        port=8765,
        reload=True,
        app_dir=str(REPOSITORY_ROOT / "src"),
        factory=True,
    )
