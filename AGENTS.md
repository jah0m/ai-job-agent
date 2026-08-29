# AI Job Agent

This repository is a Codex-native, local-first job-search workspace for the
Japanese mid-career market.

## Project invariants

- Keep candidate data, job postings, generated documents, application history,
  the SQLite database, content-addressed object store, staging operations,
  exports, backups, and recoverable trash under `.job-search/`. That directory
  must remain ignored.
- Never put personal data in `AGENTS.md`, Skills, examples, tests, or tracked
  templates.
- Treat `.agents/skills/` as the canonical agent workflow. Do not introduce a
  parallel `.claude/` workflow.
- The current application draft pointer is mutable; every draft revision,
  material package, and submission snapshot is immutable and must never be
  edited in place. Content objects are addressed by SHA-256 and shared by
  reference rather than copied between lifecycle states.
- A material package must identify its source draft ID and revision. A
  submitted snapshot must identify its source package and retain file hashes.
- Persist every discovered-job AI analysis with `job-search job evaluate`; a
  chat response or Markdown export alone does not update the Web dashboard.
  Strengths and gaps must be AI-authored, evidence-backed conclusions rather
  than keyword intersections.
- Japanese applications use both a 履歴書 and a 職務経歴書 unless the job or
  user explicitly requires a different document set.
- Run `python -m unittest discover -s tests -v` after Python changes.
- The repository Python gates are `python -m ruff check src tests scripts`,
  `python -m mypy src/ai_job_search`, and branch coverage via
  `python -m coverage run --branch -m unittest discover -s tests -v` followed by
  `python -m coverage report --show-missing --fail-under=80`; keep local and CI
  commands aligned.
- Storage-v2 implementation belongs under `src/ai_job_search/storage/` with
  infrastructure-to-domain dependency direction. Keep `storage_v2.py` and
  `workspace.py` as compatibility exports, and keep domain collaboration
  behind the internal storage protocol rather than introducing facade/domain
  import cycles.

## Project-grounded communication

- Treat questions such as "what can you do?", "how do I use this?", or "what
  does the system support?" as questions about this repository unless the user
  explicitly asks about Codex in general.
- Lead with the implemented job-search workflow: candidate profile and
  preferences, portal searches, saved jobs and match analysis, application
  tracking, revisioned current materials, immutable material packages,
  preparation checks, and submission records.
- Distinguish clearly between capabilities implemented in the Web/CLI,
  workflows Codex performs through `.agents/skills/`, and unrelated generic
  Codex capabilities. Do not present all available tools as product features.
- Explain the operating boundary when relevant: the Web dashboard displays and
  manages local state; Codex performs assisted search, evaluation, and document
  generation. Neither "record submitted" nor document generation sends an
  application to an employer.
- Do not imply that the Web dashboard can start a Codex task, that every portal
  supports identical search behavior, or that an external application was sent
  unless the current implementation and recorded state prove it.
- Prefer a short project-specific answer followed by one or two concrete next
  actions the user can request.

## Repository layout

- `src/ai_job_search/`: deterministic workspace and CLI behavior
- `.agents/`: tracked AI-agent workflows and operational instructions
- `templates/`: tracked, data-free document templates
- `schemas/`: tracked interchange schemas
- `docs/user/`: public end-user guides
- `docs/developer/`: public developer and architecture documentation
- `.private-docs/`: ignored local PRDs, design explorations, and design assets
- `.job-search/`: ignored private runtime data
