from __future__ import annotations

import secrets
import os
from email import policy
from email.parser import BytesParser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .workspace import Workspace, WorkspaceError

PACKAGE_ROOT = Path(__file__).resolve().parent
FRONTEND_ROOT = PACKAGE_ROOT / "frontend_dist"
STATUS_LABELS = {
    "new": "新发现",
    "saved": "已收藏",
    "applied": "已建立申请",
    "skipped": "已跳过",
}
APPLICATION_LABELS = {
    "draft": "准备材料",
    "evaluating": "评估中",
    "ready": "准备完成",
    "applied": "已投递",
    "interviewing": "面试中",
    "offer": "Offer",
    "rejected": "已拒绝",
    "withdrawn": "已撤回",
    "closed": "已关闭",
}
DRAFT_LABELS = {
    "empty": "未开始",
    "working": "编辑中",
}
CLOSED_APPLICATION_STATUSES = {"rejected", "withdrawn", "closed"}
JOB_STATUS_BUCKETS = (
    "application_active",
    "application_closed",
    "saved",
    "new",
    "skipped",
)

PROFILE_SECTIONS = (
    ("基本信息", "identity"),
    ("联系方式", "contact"),
    ("个人简介", "summary"),
    ("工作经历", "experience"),
    ("教育经历", "education"),
    ("技能", "skills"),
    ("语言能力", "languages"),
)


def _tags(raw: Any) -> list[str]:
    if not isinstance(raw, dict):
        return []
    values = raw.get("tags") or raw.get("skills") or raw.get("technologies") or []
    if isinstance(values, str):
        values = [part.strip() for part in values.split(",")]
    if not isinstance(values, list):
        return []
    result: list[str] = []
    for value in values:
        label = value.get("name") if isinstance(value, dict) else value
        if label and str(label).strip() not in result:
            result.append(str(label).strip())
    return result[:8]


def _description(raw: Any) -> str:
    if not isinstance(raw, dict):
        return ""
    for key in ("description", "summary", "content", "body"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _salary(raw: Any) -> str:
    """Format the employer-stated salary stored in the source payload."""
    if isinstance(raw, dict):
        value = raw.get("salary")
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            minimum = value.get("annual_minimum")
            maximum = value.get("annual_maximum")
            currency = str(value.get("currency") or "").upper()
            if currency == "JPY" and isinstance(minimum, (int, float)):
                lower = f"¥{minimum / 1_000_000:g}M"
                upper = (
                    f"¥{maximum / 1_000_000:g}M"
                    if isinstance(maximum, (int, float))
                    else ""
                )
                return f"{lower}–{upper}" if upper else f"{lower}以上"
        for tag in _tags(raw):
            if "¥" in tag or "万円" in tag:
                return tag
    return ""


def _job_facts(raw: Any) -> dict[str, Any]:
    """Return display-safe normalized facts without exposing the raw posting."""
    if not isinstance(raw, dict):
        return {}

    facts: dict[str, Any] = {}
    salary_detail = raw.get("salary_detail")
    if isinstance(salary_detail, str) and salary_detail.strip():
        facts["salary_detail"] = salary_detail.strip()

    requirements = raw.get("requirements")
    if isinstance(requirements, dict):
        normalized_requirements: dict[str, list[str]] = {}
        for key in ("must", "nice_to_have"):
            values = requirements.get(key)
            if isinstance(values, list):
                items = [
                    str(value).strip()
                    for value in values
                    if isinstance(value, str) and value.strip()
                ]
                if items:
                    normalized_requirements[key] = items
        if normalized_requirements:
            facts["requirements"] = normalized_requirements

    work_style = raw.get("work_style")
    if isinstance(work_style, dict):
        normalized_work_style: dict[str, Any] = {}
        remote = work_style.get("remote")
        if remote in {"onsite", "hybrid", "remote", "unknown"}:
            normalized_work_style["remote"] = remote
        office_days = work_style.get("office_days_per_week")
        if isinstance(office_days, int) and not isinstance(office_days, bool):
            normalized_work_style["office_days_per_week"] = office_days
        source_text = work_style.get("source_text")
        if isinstance(source_text, str) and source_text.strip():
            normalized_work_style["source_text"] = source_text.strip()
        if normalized_work_style:
            facts["work_style"] = normalized_work_style

    languages = raw.get("language_requirements")
    if isinstance(languages, list):
        normalized_languages = [
            str(value).strip()
            for value in languages
            if isinstance(value, str) and value.strip()
        ]
        if normalized_languages:
            facts["language_requirements"] = normalized_languages

    return facts


def _job_remote(raw: Any) -> str:
    if not isinstance(raw, dict):
        return ""
    work_style = raw.get("work_style")
    if not isinstance(work_style, dict):
        return ""
    remote = work_style.get("remote")
    return remote if remote in {"onsite", "hybrid", "remote", "unknown"} else ""


def _job_office_days(raw: Any) -> int | None:
    if not isinstance(raw, dict):
        return None
    work_style = raw.get("work_style")
    if not isinstance(work_style, dict):
        return None
    office_days = work_style.get("office_days_per_week")
    if isinstance(office_days, int) and not isinstance(office_days, bool):
        return office_days
    return None


def _job_status_bucket(job: dict[str, Any]) -> str:
    if job.get("status") != "applied":
        return str(job.get("status") or "")
    if job.get("application_status") in CLOSED_APPLICATION_STATUSES:
        return "application_closed"
    return "application_active"


def _value(values: dict[str, list[str]], key: str, default: str = "") -> str:
    return values.get(key, [default])[0].strip()


def _raw_value(values: dict[str, list[str]], key: str, default: str = "") -> str:
    return values.get(key, [default])[0]


def _lines(value: str) -> list[str]:
    return [line.strip() for line in value.splitlines() if line.strip()]


def _markdown_blocks(content: str) -> list[dict[str, Any]]:
    """Parse the small Markdown subset emitted by application generators."""
    lines = content.splitlines()
    blocks: list[dict[str, Any]] = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith("#"):
            marker, _, text = line.partition(" ")
            if text and set(marker) == {"#"}:
                blocks.append(
                    {"kind": "heading", "level": min(len(marker), 5), "text": text}
                )
                index += 1
                continue
        if line.startswith("|") and index + 1 < len(lines):
            separator = lines[index + 1].strip()
            separator_marks = (
                separator.replace("|", "").replace("-", "").replace(":", "").strip()
            )
            if separator.startswith("|") and not separator_marks:
                headers = [cell.strip() for cell in line.strip("|").split("|")]
                rows: list[list[str]] = []
                index += 2
                while index < len(lines) and lines[index].strip().startswith("|"):
                    rows.append(
                        [
                            cell.strip()
                            for cell in lines[index].strip().strip("|").split("|")
                        ]
                    )
                    index += 1
                blocks.append({"kind": "table", "headers": headers, "rows": rows})
                continue
        if line.startswith("- "):
            items = []
            while index < len(lines) and lines[index].strip().startswith("- "):
                items.append(lines[index].strip()[2:].strip())
                index += 1
            blocks.append({"kind": "list", "items": items})
            continue
        if line.startswith("> "):
            blocks.append({"kind": "quote", "text": line[2:].strip()})
            index += 1
            continue
        if line.startswith("[要確認"):
            blocks.append({"kind": "notice", "text": line.strip("[]")})
            index += 1
            continue
        paragraphs = [line]
        index += 1
        while index < len(lines) and lines[index].strip():
            candidate = lines[index].strip()
            if candidate.startswith(("#", "- ", "> ", "|", "[要確認")):
                break
            paragraphs.append(candidate)
            index += 1
        blocks.append({"kind": "paragraph", "text": " ".join(paragraphs)})
    return blocks


def _bounded_count(values: dict[str, list[str]], key: str) -> int:
    try:
        return min(max(int(_value(values, key, "0")), 0), 50)
    except ValueError as exc:
        raise WorkspaceError(f"Invalid form item count: {key}") from exc


def _safe_return(value: str, fallback: str) -> str:
    return value if value.startswith("/") and not value.startswith("//") else fallback


def _application_ai_prompt(application: dict[str, Any]) -> str:
    """Build a copyable handoff prompt for the Codex job-search workflow."""
    source_job_id = application.get("source_job_id") or "未记录"
    application_id = application.get("id", "")
    template_path = "templates/ja/shokumu-keirekisho.md"
    return f"""Use the `job-search` skill to prepare application materials for this exact application.

Traceability:
- application_id: {application_id}
- source_job_id: {source_job_id}
- company: {application.get('company', '')}
- role: {application.get('role', '')}

Execute the workflow directly; do not paste the full documents into chat or into the Web dashboard:
1. Read `.job-search/profile/candidate.json`, `preferences.json`, the archived job posting, and the latest AI evaluation.
2. Use only verified candidate facts and job evidence. Do not invent dates, employers, responsibilities, metrics, qualifications, or motivation. Record unresolved items as questions.
3. Prepare both `rirekisho.md` (Japanese resume) and `shokumu-keirekisho.md` (Japanese work history).

Recommended format for `shokumu-keirekisho.md`:
- First read the tracked canonical template at `{template_path}`. Use it as the default reference when the user has not specified another layout; it is not a mandatory contract.
- Prefer the template's heading levels, section order, nesting, contact-line placement, bold metadata labels, list/table structure, and table header names when they fit the user's needs. If the user prefers different headings, order, tables, or grouping, follow that preference instead. Replace placeholders with verified candidate facts.
- The default structure is `# 職務経歴書`, name, one contact/profile line, `## 職務要約`, `## 活かせる経験・知識・技術`, `## テクニカルスキル`, `## 職務経歴`, employer `###` blocks, project `####` blocks, project subsections `##### プロジェクト概要`, `##### 業務内容・工夫`, `##### 成果・実績`, `##### 開発環境`, then `## 資格` and `## 自己PR`. Use it unless the user asks for a different presentation.
- Keep each employer's metadata bullets and each project's development-environment table in the template format when using the default layout. Do not merge `業務内容・工夫` and `成果・実績` unless the user explicitly prefers a consolidated section.
- Do not add YAML/front matter, code fences, HTML, JSON, or explanatory prose outside the resume. Before saving the draft, check that the finished Markdown is internally consistent and follows the user's chosen layout.
- Keep `application_id` and `source_job_id` in the private application state and evaluation only; never insert traceability IDs into the rendered resume body.
- `rirekisho.md` may use the tracked Japanese resume template; only `shokumu-keirekisho.md` should be supplied to Markdown Resume Studio for the PDF conversion.

4. Put the prepared files plus `evaluation.json` in a temporary directory under `.job-search/cache/`, then save or update the current materials for this application:
   `python scripts/job_search.py draft save {application_id} --from <draft-directory> --status working`
5. Run `python scripts/job_search.py draft validate {application_id}` and inspect every reported error or placeholder. Keep every cache artifact and draft associated with application_id `{application_id}` and do not mix it with another application.
6. Report the concise summary, format-check result, and unresolved questions. The user may continue editing the same current materials.
7. Do not generate a PDF in AI Job Agent. The user may export through Docs/Word/a company template; for the 職務経歴書, mention Markdown Resume Studio as an optional external formatting tool.
8. Do not create a submission record unless the user separately confirms that the application was actually sent. The Web flow will automatically lock the current materials as an immutable material package when it records a submission."""


async def _multipart_values(
    request: Request,
) -> tuple[dict[str, list[str]], dict[str, tuple[str, bytes]]]:
    """Parse a small multipart upload without requiring a global form dependency."""
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data;"):
        raise WorkspaceError("Upload form must use multipart/form-data")
    raw_length = request.headers.get("content-length")
    if raw_length and int(raw_length) > 25 * 1024 * 1024:
        raise WorkspaceError("Upload request is too large")
    body = await request.body()
    if len(body) > 25 * 1024 * 1024:
        raise WorkspaceError("Upload request is too large")
    message = BytesParser(policy=policy.default).parsebytes(
        b"Content-Type: "
        + content_type.encode("ascii")
        + b"\r\nMIME-Version: 1.0\r\n\r\n"
        + body
    )
    if not message.is_multipart():
        raise WorkspaceError("Invalid multipart upload")
    values: dict[str, list[str]] = {}
    files: dict[str, tuple[str, bytes]] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        filename = part.get_filename()
        if filename:
            files[name] = (Path(filename).name, payload)
        else:
            values.setdefault(name, []).append(payload.decode("utf-8"))
    return values, files


def create_app(workspace_root: str | Path | None = None) -> FastAPI:
    workspace = Workspace(workspace_root or os.getenv("JOB_ATLAS_HOME", ".job-search"))
    workspace.initialize()

    app = FastAPI(title="AI Job Agent", docs_url=None, redoc_url=None)
    app.state.workspace = workspace
    app.state.csrf_token = secrets.token_urlsafe(32)
    frontend_assets = FRONTEND_ROOT / "assets"
    if frontend_assets.is_dir():
        app.mount("/assets", StaticFiles(directory=frontend_assets), name="frontend-assets")

    def spa_response() -> FileResponse:
        index_path = FRONTEND_ROOT / "index.html"
        if not index_path.is_file():
            raise HTTPException(status_code=503, detail="Frontend build not found")
        return FileResponse(index_path, media_type="text/html")

    def load_job_detail(job_id: str) -> dict[str, Any]:
        job = workspace.show_job(job_id)
        raw = job["raw"]
        job["tags"] = _tags(raw)
        job["description"] = _description(raw)
        job.update(_job_facts(raw))
        job["application"] = workspace.application_for_job(job_id)
        job["match_analysis"] = workspace.latest_job_evaluation(job_id)
        job["salary"] = _salary(raw)
        return job

    def load_application_detail(application_id: str) -> dict[str, Any]:
        application = workspace.show_application(application_id)
        draft = workspace.show_draft(application_id)
        for package in application["packages"]:
            package["files"] = workspace.package_files(application_id, package["id"])
            package["readiness"] = workspace.package_readiness(
                application_id, package["id"]
            )
            package["is_submitted"] = workspace.package_is_submitted(
                application_id, package["id"]
            )
            package["can_delete"] = not package["is_submitted"]
        draft["deliverable_files"] = [
            item
            for item in draft["files"]
            if Path(str(item.get("path", ""))).suffix.lower() in {".pdf", ".docx"}
        ]
        return {"application": application, "draft": draft}

    async def form_values(request: Request) -> dict[str, list[str]]:
        values = parse_qs(
            (await request.body()).decode("utf-8"), keep_blank_values=True
        )
        token = _value(values, "csrf_token")
        if not secrets.compare_digest(token, app.state.csrf_token):
            raise HTTPException(status_code=403, detail="Invalid CSRF token")
        return values

    @app.get("/api/v1/session")
    def api_session() -> dict[str, Any]:
        return {
            "csrf_token": app.state.csrf_token,
            "status_labels": STATUS_LABELS,
            "application_labels": APPLICATION_LABELS,
            "draft_status_labels": DRAFT_LABELS,
            "profile_sections": [
                {"label": label, "key": key} for label, key in PROFILE_SECTIONS
            ],
        }

    @app.get("/api/v1/jobs")
    def api_jobs(
        q: str = "",
        portal: str = "",
        status: str = "",
        recommendation: str = "",
        rating: str = "",
        selected: str = "",
    ) -> dict[str, Any]:
        all_jobs = workspace.list_jobs_for_dashboard()
        for job in all_jobs:
            raw = job["raw"]
            job["salary"] = _salary(raw)
            job["remote"] = _job_remote(raw)
            job["office_days_per_week"] = _job_office_days(raw)
            job.pop("raw", None)
        portals = sorted({job["portal"] for job in all_jobs})
        jobs = all_jobs
        normalized_query = q.casefold().strip()
        if normalized_query:
            jobs = [
                job
                for job in jobs
                if normalized_query
                in " ".join(
                    str(job.get(key) or "")
                    for key in ("title", "company", "location", "portal")
                ).casefold()
            ]
        if portal:
            jobs = [job for job in jobs if job["portal"] == portal]
        if recommendation == "unanalyzed":
            jobs = [job for job in jobs if not job.get("evaluation")]
        elif recommendation:
            jobs = [
                job
                for job in jobs
                if (job.get("evaluation") or {}).get("recommendation")
                == recommendation
            ]
        if rating == "unrated":
            jobs = [job for job in jobs if job.get("rating") is None]
        elif rating in {"3", "4"}:
            minimum_rating = int(rating)
            jobs = [
                job
                for job in jobs
                if (job.get("rating") or 0) >= minimum_rating
            ]
        counts = {
            key: sum(_job_status_bucket(job) == key for job in jobs)
            for key in JOB_STATUS_BUCKETS
        }
        if status:
            jobs = [job for job in jobs if _job_status_bucket(job) == status]
        selected_job = None
        if selected:
            try:
                selected_job = load_job_detail(selected)
                selected_job.pop("raw", None)
            except WorkspaceError:
                selected_job = None
        return {
            "jobs": jobs,
            "portals": portals,
            "selected_job": selected_job,
            "filters": {
                "q": q,
                "portal": portal,
                "status": status,
                "recommendation": recommendation,
                "rating": rating,
            },
            "counts": counts,
            "total": len(all_jobs),
        }

    @app.get("/api/v1/jobs/{job_id}")
    def api_job(job_id: str) -> dict[str, Any]:
        try:
            job = load_job_detail(job_id)
        except WorkspaceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        job.pop("raw", None)
        return job

    @app.get("/api/v1/applications")
    def api_applications() -> dict[str, Any]:
        items = workspace.list_applications()
        board_statuses = (
            "draft",
            "evaluating",
            "ready",
            "applied",
            "interviewing",
            "offer",
        )
        columns = [
            {
                "status": status,
                "label": APPLICATION_LABELS[status],
                "items": [item for item in items if item["status"] == status],
                "manual": status != "applied",
            }
            for status in board_statuses
        ]
        return {
            "applications": items,
            "columns": columns,
            "archived": [item for item in items if item["status"] not in board_statuses],
        }

    @app.get("/api/v1/applications/{application_id}")
    def api_application(application_id: str) -> dict[str, Any]:
        try:
            payload = load_application_detail(application_id)
            payload["ai_prompt"] = _application_ai_prompt(payload["application"])
            return payload
        except WorkspaceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/v1/packages")
    def api_packages() -> dict[str, Any]:
        items = []
        for application in workspace.list_applications():
            for package in workspace.list_packages(application["id"]):
                package["files"] = workspace.package_files(
                    application["id"], package["id"]
                )
                package["readiness"] = workspace.package_readiness(
                    application["id"], package["id"]
                )
                package["is_submitted"] = workspace.package_is_submitted(
                    application["id"], package["id"]
                )
                items.append({"application": application, "package": package})
        return {"items": items}

    @app.get("/api/v1/profile")
    def api_profile() -> dict[str, Any]:
        candidate = workspace.show_candidate_profile()
        section_status = [
            {"label": label, "key": key, "complete": bool(candidate.get(key))}
            for label, key in PROFILE_SECTIONS
        ]
        completed = sum(item["complete"] for item in section_status)
        completion = round(completed / len(section_status) * 100)
        return {
            "candidate": candidate,
            "section_status": section_status,
            "completion": completion,
        }

    @app.get("/api/v1/preferences")
    def api_preferences() -> dict[str, Any]:
        return {"preferences": workspace.show_preferences()}

    @app.get("/api/v1/applications/{application_id}/draft/preview/{relative_path:path}")
    def api_draft_preview(application_id: str, relative_path: str) -> dict[str, Any]:
        if relative_path not in {"rirekisho.md", "shokumu-keirekisho.md"}:
            raise HTTPException(
                status_code=400, detail="Only application Markdown can be previewed"
            )
        try:
            application = workspace.show_application(application_id)
            draft = workspace.show_draft(application_id)
        except WorkspaceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        try:
            path = workspace.draft_file_path(application_id, relative_path)
            content = path.read_text(encoding="utf-8")
        except WorkspaceError:
            # The standard document can be created from an empty editor when it
            # does not exist yet.
            content = ""
        title = {
            "rirekisho.md": "履歴書",
            "shokumu-keirekisho.md": "職务经历书",
        }.get(relative_path, Path(relative_path).stem)
        return {
            "application": application,
            "draft": draft,
            "package": None,
            "is_draft": True,
            "relative_path": relative_path,
            "document_title": title,
            "content": content,
            "blocks": _markdown_blocks(content),
        }

    @app.get(
        "/api/v1/applications/{application_id}/packages/{package_id}/preview/{relative_path:path}"
    )
    def api_package_preview(
        application_id: str, package_id: str, relative_path: str
    ) -> dict[str, Any]:
        try:
            path = workspace.package_file_path(application_id, package_id, relative_path)
            application = workspace.show_application(application_id)
            package = next(
                item
                for item in workspace.list_packages(application_id)
                if item["id"] == package_id
            )
        except (WorkspaceError, StopIteration) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if path.suffix.lower() != ".md":
            raise HTTPException(status_code=400, detail="Only Markdown files can be previewed")
        title = {
            "rirekisho.md": "履歴書",
            "shokumu-keirekisho.md": "职务经历书",
        }.get(path.name, path.stem)
        content = path.read_text(encoding="utf-8")
        return {
            "application": application,
            "draft": None,
            "package": package,
            "is_draft": False,
            "relative_path": relative_path,
            "document_title": title,
            "content": content,
            "blocks": _markdown_blocks(content),
        }

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/")
    def spa_index() -> FileResponse:
        return spa_response()

    @app.post("/jobs/{job_id}/status")
    async def update_job_status(job_id: str, request: Request) -> RedirectResponse:
        values = await form_values(request)
        status = _value(values, "status")
        try:
            workspace.update_job_status(job_id, status=status)
        except WorkspaceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/?selected={job_id}", status_code=303)

    @app.post("/jobs/{job_id}/review")
    async def update_job_review(job_id: str, request: Request) -> RedirectResponse:
        values = await form_values(request)
        raw_rating = _value(values, "rating")
        try:
            rating = int(raw_rating) if raw_rating else None
            workspace.update_job_review(
                job_id, rating=rating, notes=_value(values, "notes")
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/?selected={job_id}", status_code=303)

    @app.post("/jobs/{job_id}/application")
    async def create_job_application(job_id: str, request: Request) -> RedirectResponse:
        await form_values(request)
        try:
            application = workspace.create_application_from_job(job_id)
        except WorkspaceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(
            url=f"/applications/{application['id']}", status_code=303
        )

    @app.post("/applications/{application_id}/status")
    async def update_application_status(
        application_id: str, request: Request
    ) -> RedirectResponse:
        values = await form_values(request)
        try:
            workspace.update_status(
                application_id,
                status=_value(values, "status"),
                note=_value(values, "note") or None,
            )
        except WorkspaceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(
            url=_safe_return(
                _value(values, "return_to"), f"/applications/{application_id}"
            ),
            status_code=303,
        )

    @app.post("/applications/{application_id}/draft/upload")
    async def upload_application_draft(
        application_id: str, request: Request
    ) -> RedirectResponse:
        try:
            values, uploads = await _multipart_values(request)
            token = _value(values, "csrf_token")
            if not secrets.compare_digest(token, app.state.csrf_token):
                raise HTTPException(status_code=403, detail="Invalid CSRF token")
            documents: dict[str, bytes] = {}
            for field, canonical_name in (
                ("rirekisho", "rirekisho.md"),
                ("shokumu_keirekisho", "shokumu-keirekisho.md"),
            ):
                upload = uploads.get(field)
                if not upload:
                    continue
                filename, payload = upload
                if Path(filename).suffix.lower() != ".md":
                    raise WorkspaceError("Only .md files can be uploaded")
                documents[canonical_name] = payload
            raw_revision = _value(values, "expected_revision")
            expected_revision = int(raw_revision) if raw_revision else None
            workspace.save_draft(
                application_id,
                documents=documents,
                base_package_id=_value(values, "base_package_id") or None,
                label=_value(values, "label") or None,
                status="working",
                actor="web",
                expected_revision=expected_revision,
            )
        except HTTPException:
            raise
        except (ValueError, UnicodeDecodeError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/draft/validate")
    async def validate_application_draft(
        application_id: str, request: Request
    ) -> RedirectResponse:
        await form_values(request)
        try:
            workspace.validate_draft(application_id, actor="web")
        except WorkspaceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/materials/package")
    async def save_material_package(
        application_id: str, request: Request
    ) -> RedirectResponse:
        values = await form_values(request)
        try:
            raw_revision = _value(values, "expected_revision")
            expected_revision = int(raw_revision) if raw_revision else None
            workspace.lock_current_materials(
                application_id,
                label=_value(values, "label") or None,
                actor="web",
                expected_revision=expected_revision,
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/draft/discard")
    async def discard_application_draft(
        application_id: str, request: Request
    ) -> RedirectResponse:
        values = await form_values(request)
        try:
            raw_revision = _value(values, "expected_revision")
            expected_revision = int(raw_revision) if raw_revision else None
            workspace.discard_draft(
                application_id,
                actor="web",
                expected_revision=expected_revision,
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/packages/{package_id}/restore")
    async def restore_current_materials_from_package(
        application_id: str, package_id: str, request: Request
    ) -> RedirectResponse:
        values = await form_values(request)
        try:
            raw_revision = _value(values, "expected_revision")
            expected_revision = int(raw_revision) if raw_revision else None
            workspace.restore_current_materials_from_package(
                application_id,
                package_id=package_id,
                actor="web",
                expected_revision=expected_revision,
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/materials/upload-deliverable")
    async def upload_deliverable_material(
        application_id: str, request: Request
    ) -> RedirectResponse:
        try:
            values, uploads = await _multipart_values(request)
            token = _value(values, "csrf_token")
            if not secrets.compare_digest(token, app.state.csrf_token):
                raise HTTPException(status_code=403, detail="Invalid CSRF token")
            upload = uploads.get("file")
            if not upload:
                raise WorkspaceError("请选择 PDF 或 DOCX 文件")
            filename, payload = upload
            raw_revision = _value(values, "expected_revision")
            workspace.save_deliverable_file(
                application_id,
                filename=filename,
                payload=payload,
                purpose=_value(values, "purpose", "other"),
                role=_value(values, "role", "deliverable"),
                origin=_value(values, "origin", "user_uploaded"),
                source_path=_value(values, "source_path") or None,
                expected_revision=int(raw_revision) if raw_revision else None,
            )
        except HTTPException:
            raise
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/materials/remove-deliverable")
    async def remove_deliverable_material(
        application_id: str, request: Request
    ) -> RedirectResponse:
        values = await form_values(request)
        try:
            raw_revision = _value(values, "expected_revision")
            workspace.remove_deliverable_file(
                application_id,
                relative_path=_value(values, "relative_path"),
                expected_revision=int(raw_revision) if raw_revision else None,
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/draft/edit/{relative_path:path}")
    async def save_edited_draft_document(
        application_id: str,
        relative_path: str,
        request: Request,
    ) -> RedirectResponse:
        values = await form_values(request)
        if relative_path not in {"rirekisho.md", "shokumu-keirekisho.md"}:
            raise HTTPException(
                status_code=400, detail="Only application Markdown can be edited"
            )
        try:
            raw_revision = _value(values, "expected_revision")
            expected_revision = int(raw_revision) if raw_revision else None
            workspace.save_draft(
                application_id,
                documents={
                    relative_path: _raw_value(values, "content").encode("utf-8")
                },
                label=_value(values, "label") or f"在线编辑 · {relative_path}",
                status="working",
                actor="web",
                expected_revision=expected_revision,
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/packages/{package_id}/delete")
    async def delete_application_package(
        application_id: str, package_id: str, request: Request
    ) -> RedirectResponse:
        await form_values(request)
        try:
            workspace.delete_package(application_id, package_id=package_id)
        except WorkspaceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.post("/applications/{application_id}/submit")
    async def record_submission(
        application_id: str, request: Request
    ) -> RedirectResponse:
        values = await form_values(request)
        try:
            raw_revision = _value(values, "expected_revision")
            workspace.submit(
                application_id,
                package_id=_value(values, "package_id") or None,
                selected_paths=values.get("selected_files", []),
                evidence_level=_value(values, "evidence_level", "exact_files"),
                submitted_at=_value(values, "submitted_at") or None,
                channel=_value(values, "channel", "other"),
                external_reference=_value(values, "external_reference") or None,
                note=_value(values, "note") or None,
                expected_revision=int(raw_revision) if raw_revision else None,
            )
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url=f"/applications/{application_id}", status_code=303)

    @app.get("/applications/{application_id}/draft/files/{relative_path:path}")
    def download_draft_file(application_id: str, relative_path: str) -> FileResponse:
        try:
            path = workspace.draft_file_path(application_id, relative_path)
        except WorkspaceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if path.suffix.lower() == ".pdf":
            return FileResponse(
                path,
                filename=path.name,
                media_type="application/pdf",
                content_disposition_type="inline",
                headers={"Cache-Control": "private, no-store"},
            )
        return FileResponse(path, filename=path.name)

    @app.get(
        "/applications/{application_id}/packages/{package_id}/files/{relative_path:path}"
    )
    def download_package_file(
        application_id: str, package_id: str, relative_path: str
    ) -> FileResponse:
        try:
            path = workspace.package_file_path(
                application_id, package_id, relative_path
            )
        except WorkspaceError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if path.suffix.lower() == ".pdf":
            return FileResponse(
                path,
                filename=path.name,
                media_type="application/pdf",
                content_disposition_type="inline",
                headers={"Cache-Control": "private, no-store"},
            )
        return FileResponse(path, filename=path.name)

    @app.post("/profile/edit")
    async def save_profile(request: Request) -> RedirectResponse:
        values = await form_values(request)
        current = workspace.show_candidate_profile()
        experience = []
        for index in range(_bounded_count(values, "experience_count")):
            item = {
                "company": _value(values, f"experience_company_{index}"),
                "title_ja": _value(values, f"experience_title_ja_{index}"),
                "title_en": _value(values, f"experience_title_en_{index}"),
                "start": _value(values, f"experience_start_{index}"),
                "end": _value(values, f"experience_end_{index}"),
                "product": _value(values, f"experience_product_{index}"),
                "facts": _lines(_value(values, f"experience_facts_{index}")),
            }
            if (
                any(value for key, value in item.items() if key != "facts")
                or item["facts"]
            ):
                experience.append(item)
        education = []
        for index in range(_bounded_count(values, "education_count")):
            item = {
                "institution": _value(values, f"education_institution_{index}"),
                "degree": _value(values, f"education_degree_{index}"),
                "field": _value(values, f"education_field_{index}"),
                "start": _value(values, f"education_start_{index}"),
                "graduated": _value(values, f"education_graduated_{index}"),
            }
            if any(item.values()):
                education.append(item)
        languages = []
        for index in range(_bounded_count(values, "language_count")):
            item = {
                "language": _value(values, f"language_name_{index}"),
                "level": _value(values, f"language_level_{index}"),
                "evidence": _value(values, f"language_evidence_{index}"),
                "date": _value(values, f"language_date_{index}"),
            }
            if any(item.values()):
                languages.append(item)
        current.update(
            {
                "identity": {
                    "name_ja": _value(values, "name_ja"),
                    "name_en": _value(values, "name_en"),
                    "location": _value(values, "location"),
                    "employment_status": _value(values, "employment_status"),
                    "current_employer": _value(values, "current_employer"),
                    "current_title": _value(values, "current_title"),
                },
                "contact": {
                    "email": _value(values, "email"),
                    "phone": _value(values, "phone"),
                    "linkedin": _value(values, "linkedin"),
                    "github": _value(values, "github"),
                },
                "summary": _value(values, "summary"),
                "experience": experience,
                "education": education,
                "skills": _lines(_value(values, "skills")),
                "languages": languages,
            }
        )
        try:
            workspace.update_candidate_profile(current)
        except WorkspaceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url="/profile", status_code=303)

    @app.post("/preferences/edit")
    async def save_preferences(request: Request) -> RedirectResponse:
        values = await form_values(request)
        current = workspace.show_preferences()
        office_days = _value(values, "maximum_office_days_per_week")
        minimum = _value(values, "compensation_minimum")
        target = _value(values, "compensation_target")
        try:
            current.update(
                {
                    "target_roles": _lines(_value(values, "target_roles")),
                    "target_domains": _lines(_value(values, "target_domains")),
                    "locations": _lines(_value(values, "locations")),
                    "work_style": {
                        "remote_preferred": "remote_preferred" in values,
                        "maximum_office_days_per_week": (
                            int(office_days) if office_days else None
                        ),
                        "autonomy_preferred": "autonomy_preferred" in values,
                        "focus_time_preferred": "focus_time_preferred" in values,
                    },
                    "compensation": {
                        "currency": _value(values, "compensation_currency"),
                        "minimum": int(minimum) if minimum else None,
                        "target": int(target) if target else None,
                    },
                    "hard_constraints": _lines(_value(values, "hard_constraints")),
                    "soft_preferences": _lines(_value(values, "soft_preferences")),
                    "blacklisted_companies": _lines(
                        _value(values, "blacklisted_companies")
                    ),
                }
            )
            workspace.update_preferences(current)
        except (ValueError, WorkspaceError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return RedirectResponse(url="/preferences", status_code=303)

    @app.api_route(
        "/{path:path}",
        methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )
    def spa_fallback(request: Request, path: str) -> FileResponse:
        if (
            path == "api"
            or path.startswith("api/")
            or path == "static"
            or path.startswith("static/")
            or path == "assets"
            or path.startswith("assets/")
        ):
            raise HTTPException(status_code=404, detail="Not found")
        if request.method in {"GET", "HEAD"}:
            return spa_response()
        raise HTTPException(status_code=404, detail="Not found")

    return app
