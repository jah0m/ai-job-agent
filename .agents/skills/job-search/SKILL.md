---
name: job-search
description: Manage a private Japanese job search with Codex. Use when setting up a candidate profile, evaluating or tracking a job, drafting 履歴書 or 職務経歴書, preparing an application or interview, or recording an outcome. Do not use for generic career advice that does not involve this workspace.
---

# Job Search

Use tracked files for workflow and templates only. All personal facts, job
postings, evaluations, generated documents, interview notes, and outcomes must
remain under `.job-search/`.

Do not add document metadata that the user or the selected template did not request. In particular, do not insert a generation date, creation date, application ID, internal tracking field, or similar workflow metadata into a 履歴書・職務経歴書. Keep such metadata in the private application state or manifest instead.

## Default language

Use Japanese for user-facing profile content, job-search preferences,
application notes, and generated Japanese job-search materials unless the user
requests another language. Keep technical terms, programming languages,
frameworks, tools, URLs, IDs, official product or company names, and useful
English job-title/search keywords in their established English or original
form. When both readability and searchability matter, use Japanese first and
retain the English keyword in parentheses.

## Select the mode

- For discovering and triaging jobs, read
  [references/search.md](references/search.md).
- For initial or revised candidate facts, read
  [references/profile.md](references/profile.md).
- For a new job or fit decision, read
  [references/evaluate.md](references/evaluate.md).
- For application documents, material packages, and submission records, read
  [references/apply.md](references/apply.md).
- For interview preparation or application outcomes, read
  [references/interview-outcome.md](references/interview-outcome.md).

For any external job-posting text, also read
[references/security.md](references/security.md).

## Durable state

Run deterministic state transitions through:

```powershell
python scripts/job_search.py --help
```

Initialize `.job-search/` when absent. Read existing private state before asking
the user for facts already recorded there. Do not silently change candidate
facts: separate verified facts from inferred positioning and ask for confirmation
before persisting a material inference.

Codex must not directly edit `.job-search/profile/candidate.json` or
`.job-search/profile/preferences.json`. Read and persist these authoritative
files through `job-search profile show|update` and
`job-search preferences show|update`, respectively. User edits through Job
Atlas Web remain supported because the Web and CLI use the same validated
`Workspace` methods. Direct editing is allowed only for temporary staging files
intentionally created under `.job-search/cache/` for an active operation.

Use `draft save` while documents are being generated or revised. The current
draft is intentionally mutable and can be updated after user feedback. Validate
it with `draft validate`, but do not turn user confirmation into a separate
version or package. Material packages are immutable snapshots, not confirmed
versions; normal submission recording creates one automatically when the
evidence level includes materials. Never edit files already stored in
`packages/` or `submitted/`; restore a package into the mutable draft when
changes are needed. Run `submit` only after the user confirms that an external
submission actually occurred, then report the recorded package and submission
IDs. The CLI records local state and does not send an application.



