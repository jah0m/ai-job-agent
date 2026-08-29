from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_SCRIPTS = {"preinstall", "install", "postinstall", "prepare", "prepack"}
ALLOWED_SKILL_KEYS = {"name", "description", "license", "metadata", "allowed-tools"}
TEST_URL_PATTERN = re.compile(r"https?://[^\s\"'`<>]+")
TEST_SOURCE_SUFFIXES = {".js", ".json", ".jsx", ".py", ".ts", ".tsx"}


def check_compatibility_alias(root: Path, alias: str, target: str) -> list[str]:
    """Allow compatibility aliases only when they point to canonical files."""
    alias_path = root / alias
    if not alias_path.exists() and not alias_path.is_symlink():
        return []
    if not alias_path.is_symlink():
        return [
            f"{alias} must be a symbolic link to {target}; "
            "parallel agent instructions are forbidden"
        ]
    try:
        resolved_alias = alias_path.resolve(strict=True)
        resolved_target = (root / target).resolve(strict=True)
    except OSError as exc:
        return [f"{alias} compatibility link is invalid: {exc}"]
    if resolved_alias != resolved_target:
        return [f"{alias} must point to {target}, not {resolved_alias}"]
    return []


def check_gitignore(root: Path) -> list[str]:
    errors: list[str] = []
    path = root / ".gitignore"
    try:
        rules = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    except OSError as exc:
        return [f".gitignore is unreadable: {exc}"]
    if "/.job-search/" not in rules:
        errors.append(".gitignore must contain the root-anchored rule '/.job-search/'")
    for rule in rules:
        if not rule.startswith("!"):
            continue
        target = rule[1:].lstrip("/")
        if target == ".job-search" or target.startswith(".job-search/"):
            errors.append(f".gitignore must not re-include private workspace data: {rule}")
    return errors


def check_agent_layout(root: Path) -> list[str]:
    errors = check_compatibility_alias(root, ".claude", ".agents")
    errors += check_compatibility_alias(root, "CLAUDE.md", "AGENTS.md")
    skill_files = sorted((root / ".agents" / "skills").glob("*/SKILL.md"))
    if not skill_files:
        errors.append("no project Skills were found under .agents/skills")
        return errors
    for path in skill_files:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"{path.relative_to(root)} is unreadable: {exc}")
            continue
        if not text.startswith("---\n") or "\n---\n" not in text[4:]:
            errors.append(f"{path.relative_to(root)} has invalid frontmatter boundaries")
            continue
        frontmatter = text.split("\n---\n", 1)[0][4:]
        keys = {
            match.group(1)
            for line in frontmatter.splitlines()
            if (match := re.match(r"^([A-Za-z][A-Za-z0-9-]*):", line))
        }
        missing = {"name", "description"} - keys
        unknown = keys - ALLOWED_SKILL_KEYS
        if missing:
            errors.append(
                f"{path.relative_to(root)} is missing frontmatter keys: {sorted(missing)}"
            )
        if unknown:
            errors.append(
                f"{path.relative_to(root)} has unsupported frontmatter keys: {sorted(unknown)}"
            )
    return errors


def check_package_manifests(root: Path) -> list[str]:
    errors: list[str] = []
    manifests = [
        path
        for path in root.glob(".agents/**/package.json")
        if "node_modules" not in path.parts
    ]
    for path in manifests:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{path.relative_to(root)} is invalid: {exc}")
            continue
        if not isinstance(data, dict):
            errors.append(f"{path.relative_to(root)} must contain a JSON object")
            continue
        scripts = data.get("scripts", {})
        if not isinstance(scripts, dict):
            errors.append(f"{path.relative_to(root)} scripts must be an object")
            continue
        forbidden = FORBIDDEN_SCRIPTS & scripts.keys()
        if forbidden:
            errors.append(
                f"{path.relative_to(root)} contains forbidden lifecycle scripts: {sorted(forbidden)}"
            )
        if "trustedDependencies" in data:
            errors.append(f"{path.relative_to(root)} must not use trustedDependencies")
    return errors


def check_test_urls(root: Path) -> list[str]:
    """Reject live internet URLs embedded in tracked test fixtures."""
    candidates = list((root / "tests").rglob("*"))
    candidates += list((root / ".agents" / "skills").glob("*/cli/tests/**/*"))
    errors: list[str] = []
    for path in sorted(set(candidates)):
        if not path.is_file() or path.suffix.lower() not in TEST_SOURCE_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"{path.relative_to(root)} is unreadable: {exc}")
            continue
        for match in TEST_URL_PATTERN.finditer(text):
            url = match.group(0).rstrip(".,);]")
            hostname = (urlsplit(url).hostname or "").lower()
            if (
                hostname == "localhost"
                or hostname in {"127.0.0.1", "::1"}
                or hostname.endswith(".invalid")
            ):
                continue
            errors.append(
                f"{path.relative_to(root)} embeds a live URL; use example.invalid "
                "or a loopback address instead"
            )
    return errors


def run_checks(root: Path = ROOT) -> list[str]:
    return (
        check_gitignore(root)
        + check_agent_layout(root)
        + check_package_manifests(root)
        + check_test_urls(root)
    )


def main() -> int:
    errors = run_checks()
    if errors:
        print(f"security_guards: {len(errors)} failure(s)")
        for error in errors:
            print(f"  - {error}")
        return 1
    print("security_guards: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
