from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence

from .workspace import VALID_STATUSES, Workspace, WorkspaceError
from .pdf import verify_pdf


def _print(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="job-search",
        description="Manage a private, versioned AI job-search workspace.",
    )
    parser.add_argument(
        "--home",
        default=".job-search",
        help="Private workspace path (default: ./.job-search)",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("init", help="Initialize the private workspace")

    profile = commands.add_parser("profile", help="Read or update the candidate profile")
    profile_commands = profile.add_subparsers(dest="profile_command", required=True)
    profile_commands.add_parser("show", help="Show the candidate profile")
    profile_update = profile_commands.add_parser(
        "update", help="Replace the candidate profile from a validated JSON file"
    )
    profile_update.add_argument("--file", required=True, type=Path)

    preferences = commands.add_parser(
        "preferences", help="Read or update job-search preferences"
    )
    preferences_commands = preferences.add_subparsers(
        dest="preferences_command", required=True
    )
    preferences_commands.add_parser("show", help="Show job-search preferences")
    preferences_update = preferences_commands.add_parser(
        "update", help="Replace job-search preferences from a validated JSON file"
    )
    preferences_update.add_argument("--file", required=True, type=Path)

    application = commands.add_parser("application", help="Manage applications")
    application_commands = application.add_subparsers(dest="application_command", required=True)
    create = application_commands.add_parser("create", help="Create an application")
    _add_application_arguments(create)
    application_commands.add_parser("list", help="List applications")
    show = application_commands.add_parser("show", help="Show one application")
    show.add_argument("application_id")

    apply_command = commands.add_parser(
        "apply", help="Create an application record (Codex-friendly alias)"
    )
    _add_application_arguments(apply_command)

    job = commands.add_parser("job", help="Import and triage portal search results")
    job_commands = job.add_subparsers(dest="job_command", required=True)
    job_import = job_commands.add_parser("import", help="Import a portal JSON result set")
    job_import.add_argument("--portal", required=True)
    job_import.add_argument("--file", required=True, type=Path)
    job_list = job_commands.add_parser("list", help="List discovered jobs")
    job_list.add_argument("--status", choices=["new", "saved", "skipped", "applied"])
    job_status = job_commands.add_parser("status", help="Update discovered-job status")
    job_status.add_argument("job_id")
    job_status.add_argument("status", choices=["new", "saved", "skipped", "applied"])
    job_evaluate = job_commands.add_parser(
        "evaluate", help="Store an AI-authored structured evaluation for a discovered job"
    )
    job_evaluate.add_argument("job_id")
    job_evaluate.add_argument("--file", required=True, type=Path)
    job_apply = job_commands.add_parser("apply", help="Create an application from a discovered job")
    job_apply.add_argument("job_id")

    draft = commands.add_parser("draft", help="Create and edit the current application draft")
    draft_commands = draft.add_subparsers(dest="draft_command", required=True)
    draft_show = draft_commands.add_parser("show", help="Show the current application draft")
    draft_show.add_argument("application_id")
    draft_create = draft_commands.add_parser(
        "restore", help="Restore current materials from an immutable package"
    )
    draft_create.add_argument("application_id")
    draft_create.add_argument("--from-package", required=True, dest="base_package_id")
    draft_create.add_argument("--expected-revision", type=int)
    draft_save = draft_commands.add_parser("save", help="Save or update the current draft")
    draft_save.add_argument("application_id")
    draft_save.add_argument("--from", required=True, dest="source_directory")
    draft_save.add_argument("--base-package", dest="base_package_id")
    draft_save.add_argument("--label")
    draft_save.add_argument(
        "--status",
        choices=["working"],
        default="working",
    )
    draft_save.add_argument("--expected-revision", type=int)
    draft_validate = draft_commands.add_parser("validate", help="Validate the current draft")
    draft_validate.add_argument("application_id")
    draft_discard = draft_commands.add_parser(
        "discard", help="Move the current draft to local trash and clear it"
    )
    draft_discard.add_argument("application_id")
    draft_discard.add_argument("--expected-revision", type=int)

    package = commands.add_parser("package", help="Manage immutable material packages")
    package_commands = package.add_subparsers(dest="package_command", required=True)
    package_list = package_commands.add_parser("list", help="List material packages")
    package_list.add_argument("application_id")
    package_create = package_commands.add_parser(
        "create", help="Save the current materials as an immutable package"
    )
    package_create.add_argument("application_id")
    package_create.add_argument("--label")
    package_create.add_argument("--expected-revision", type=int)

    submit = commands.add_parser("submit", help="Record an application that was actually sent")
    submit.add_argument("application_id")
    submit.add_argument("--package", dest="package_id")
    submit.add_argument("--file", action="append", default=[], dest="selected_paths")
    submit.add_argument(
        "--evidence",
        choices=["exact_files", "source_only", "status_only"],
        default="exact_files",
        dest="evidence_level",
    )
    submit.add_argument("--submitted-at")
    submit.add_argument(
        "--channel",
        choices=["company_portal", "email", "recruiting_agent", "linkedin", "other"],
        default="other",
    )
    submit.add_argument("--reference", dest="external_reference")
    submit.add_argument("--note")
    submit.add_argument("--expected-revision", type=int)

    status = commands.add_parser("status", help="Update application status")
    status.add_argument("application_id")
    status.add_argument("status", choices=sorted(VALID_STATUSES))
    status.add_argument("--note")

    commands.add_parser("export", help="Export a portable JSON summary")
    commands.add_parser("audit", help="Verify all stored artifact hashes")

    document = commands.add_parser("document", help="Validate generated documents")
    document_commands = document.add_subparsers(dest="document_command", required=True)
    verify = document_commands.add_parser("verify-pdf", help="Check PDF pages and ATS text")
    verify.add_argument("pdf", type=Path)
    verify.add_argument("--pages", type=int)
    verify.add_argument("--min-chars", type=int, default=1)
    verify.add_argument("--contains", action="append", default=[])
    return parser


def _add_application_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--company", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--url", dest="job_url")


def _read_json_file(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkspaceError(f"{label} file does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkspaceError(f"Invalid {label} JSON in {path}: {exc}") from exc


def run(args: argparse.Namespace) -> Any:
    workspace = Workspace(args.home)
    if args.command == "init":
        return workspace.initialize()
    if args.command == "profile":
        if args.profile_command == "show":
            return workspace.show_candidate_profile()
        return workspace.update_candidate_profile(
            _read_json_file(args.file, label="candidate profile")
        )
    if args.command == "preferences":
        if args.preferences_command == "show":
            return workspace.show_preferences()
        return workspace.update_preferences(
            _read_json_file(args.file, label="preferences")
        )
    if args.command == "apply" or (
        args.command == "application" and args.application_command == "create"
    ):
        return workspace.create_application(
            company=args.company,
            role=args.role,
            source=args.source,
            job_url=args.job_url,
        )
    if args.command == "application":
        if args.application_command == "list":
            return workspace.list_applications()
        return workspace.show_application(args.application_id)
    if args.command == "job":
        if args.job_command == "import":
            return workspace.import_jobs(portal=args.portal, source_file=args.file)
        if args.job_command == "list":
            return workspace.list_jobs(status=args.status)
        if args.job_command == "status":
            return workspace.update_job_status(args.job_id, status=args.status)
        if args.job_command == "evaluate":
            workspace.initialize()
            evaluation = _read_json_file(args.file, label="evaluation")
            return workspace.record_job_evaluation(args.job_id, evaluation)
        return workspace.create_application_from_job(args.job_id)
    if args.command == "draft":
        if args.draft_command == "show":
            return workspace.show_draft(args.application_id)
        if args.draft_command == "restore":
            return workspace.restore_current_materials_from_package(
                args.application_id,
                package_id=args.base_package_id,
                expected_revision=args.expected_revision,
            )
        if args.draft_command == "save":
            return workspace.save_draft(
                args.application_id,
                source_directory=args.source_directory,
                base_package_id=args.base_package_id,
                label=args.label,
                status=args.status,
                expected_revision=args.expected_revision,
            )
        if args.draft_command == "validate":
            return workspace.validate_draft(args.application_id)
        return workspace.discard_draft(
            args.application_id, expected_revision=args.expected_revision
        )
    if args.command == "package":
        if args.package_command == "list":
            return workspace.list_packages(args.application_id)
        return workspace.lock_current_materials(
            args.application_id,
            label=args.label,
            expected_revision=args.expected_revision,
        )
    if args.command == "submit":
        return workspace.submit(
            args.application_id,
            package_id=args.package_id,
            selected_paths=args.selected_paths,
            evidence_level=args.evidence_level,
            submitted_at=args.submitted_at,
            channel=args.channel,
            external_reference=args.external_reference,
            note=args.note,
            expected_revision=args.expected_revision,
        )
    if args.command == "status":
        return workspace.update_status(
            args.application_id, status=args.status, note=args.note
        )
    if args.command == "export":
        return workspace.export_summary()
    if args.command == "audit":
        result = workspace.audit()
        if not result["ok"]:
            raise WorkspaceError("Audit failed: " + "; ".join(result["errors"]))
        return result
    if args.command == "document":
        result = verify_pdf(
            args.pdf,
            expected_pages=args.pages,
            min_characters=args.min_chars,
            required_text=tuple(args.contains),
        )
        if not result["ok"]:
            raise WorkspaceError("PDF verification failed: " + "; ".join(result["errors"]))
        return result
    raise AssertionError(f"Unhandled command: {args.command}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        _print(run(args))
        return 0
    except WorkspaceError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
