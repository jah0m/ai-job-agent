from __future__ import annotations

import re
from pathlib import Path
from typing import Any

TEMPLATE_REVISION = "md-resume-sample-v1"
REQUIRED_DOCUMENTS = ("rirekisho.md", "shokumu-keirekisho.md")
# These headings describe the default template shown to Codex and users. They
# are intentionally advisory: a user's preferred section names and order must
# not make an otherwise usable Markdown document fail validation.
TOP_LEVEL_HEADINGS = (
    "職務要約",
    "活かせる経験・知識・技術",
    "テクニカルスキル",
    "職務経歴",
    "資格",
    "自己PR",
)
# Likewise, these are the recommended project subsections, not a required
# layout contract.
PROJECT_HEADINGS = (
    "プロジェクト概要",
    "業務内容・工夫",
    "成果・実績",
    "開発環境",
)
TRACEABILITY_MARKERS = ("application_id", "source_job_id", ".job-search")
HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)\s*$")


def _headings(lines: list[str]) -> list[tuple[int, int, str]]:
    result: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        match = HEADING_RE.match(line.strip())
        if match:
            result.append((index, len(match.group(1)), match.group(2).strip()))
    return result


def _common_text_errors(content: str, *, name: str) -> list[str]:
    errors: list[str] = []
    if not content.strip():
        errors.append(f"{name} 为空")
        return errors
    if "```" in content:
        errors.append(f"{name} 不得包含代码围栏")
    if re.search(r"(?<![/\w])</?[A-Za-z][^>]*>", content):
        errors.append(f"{name} 不得包含 HTML")
    lowered = content.casefold()
    for marker in TRACEABILITY_MARKERS:
        if marker.casefold() in lowered:
            errors.append(f"{name} 不得包含内部追踪字段 {marker}")
    return errors


def _validate_rirekisho(content: str) -> list[str]:
    errors = _common_text_errors(content, name="rirekisho.md")
    first = next((line.strip() for line in content.splitlines() if line.strip()), "")
    if first != "# 履歴書":
        errors.append("rirekisho.md 首行必须是 # 履歴書")
    return errors


def _validate_shokumu(content: str) -> list[str]:
    errors = _common_text_errors(content, name="shokumu-keirekisho.md")
    if not content.strip():
        return errors

    lines = content.splitlines()
    headings = _headings(lines)
    if not headings or headings[0][1:] != (1, "職務経歴書"):
        errors.append("shokumu-keirekisho.md 必须以 # 職務経歴書 开始")
        return errors

    first_h2 = next((item for item in headings if item[1] == 2), None)
    if first_h2 is None:
        errors.append("shokumu-keirekisho.md 缺少一级目录")
        return errors
    prelude = "\n".join(lines[headings[0][0] + 1 : first_h2[0]])
    if not re.search(r"\*\*.*?\*\*", prelude, flags=re.DOTALL):
        errors.append("職務経歴書标题后必须保留粗体姓名区块")
    if not re.search(r"(?m)^Phone:\s*", prelude):
        errors.append("職務経歴書姓名区块后必须包含 Phone: 联系方式")
    if not re.search(r"(?m)^.*Email:\s*", prelude):
        errors.append("職務経歴書姓名区块后必须包含 Email: 联系方式")

    job_section = next(
        (index for index, item in enumerate(headings) if item[1:] == (2, "職務経歴")),
        None,
    )
    qualification_section = next(
        (index for index, item in enumerate(headings) if item[1:] == (2, "資格")),
        None,
    )
    if job_section is None or qualification_section is None:
        errors.append("職務経歴書缺少有效的职务经历区块")
        return errors

    # The recommended template puts 資格 after 職務経歴, but users may choose
    # another top-level section order. Parse the work section until the next
    # H2 instead of treating 資格's position as a validity requirement.
    work_end = next(
        (
            index
            for index in range(job_section + 1, len(headings))
            if headings[index][1] == 2
        ),
        len(headings),
    )
    work_end_line = (
        headings[work_end][0] if work_end < len(headings) else len(lines)
    )
    work_headings = headings[job_section + 1 : work_end]
    employers = [item for item in work_headings if item[1] == 3]
    if not employers:
        errors.append("職務経歴 下至少需要一个三级公司区块")

    for employer_index, employer in enumerate(employers):
        next_boundary = (
            employers[employer_index + 1][0]
            if employer_index + 1 < len(employers)
            else work_end_line
        )
        employer_start = employer[0]
        employer_end = next_boundary
        employer_body = "\n".join(lines[employer_start + 1 : employer_end])
        for label in ("事業内容", "雇用形態"):
            if not re.search(rf"(?m)^- \*\*{re.escape(label)}：\*\*", employer_body):
                errors.append(f"公司区块“{employer[2]}”缺少 {label} 元数据")

        projects = [
            item
            for item in work_headings
            if item[1] == 4 and employer_start < item[0] < employer_end
        ]
        if not projects:
            errors.append(f"公司区块“{employer[2]}”至少需要一个四级项目区块")
            continue

        for project_index, project in enumerate(projects):
            project_end = (
                projects[project_index + 1][0]
                if project_index + 1 < len(projects)
                else employer_end
            )
            project_body = "\n".join(lines[project[0] + 1 : project_end])
            if not re.search(r"(?m)^- \*\*担当：\*\*", project_body):
                errors.append(f"项目区块“{project[2]}”缺少 担当 元数据")


    return errors


def validate_application_documents(directory: str | Path) -> dict[str, Any]:
    base = Path(directory)
    errors: list[str] = []
    missing: list[str] = []
    placeholders: list[str] = []
    contents: dict[str, str] = {}

    for name in REQUIRED_DOCUMENTS:
        path = base / name
        if not path.is_file():
            missing.append(name)
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"{name} 必须使用 UTF-8 编码")
            continue
        contents[name] = content
        if "[要確認" in content or "[要确认" in content:
            placeholders.append(name)

    if "rirekisho.md" in contents:
        errors.extend(_validate_rirekisho(contents["rirekisho.md"]))
    if "shokumu-keirekisho.md" in contents:
        errors.extend(_validate_shokumu(contents["shokumu-keirekisho.md"]))

    return {
        "template_revision": TEMPLATE_REVISION,
        "complete_documents": not missing,
        "missing": missing,
        "errors": errors,
        "placeholders": placeholders,
        "format_valid": not missing and not errors,
        "ready": not missing and not errors and not placeholders,
    }
