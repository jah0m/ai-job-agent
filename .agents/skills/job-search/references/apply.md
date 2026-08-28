# Prepare an application

Read the candidate profile, preferences, archived posting, and latest evaluation.
Use `templates/ja/rirekisho.md` and `templates/ja/shokumu-keirekisho.md` as
structural starting points. Produce both documents unless the employer or user
requests a different set.

## Writing rules

- Tailor selection and ordering, not truth.
- Do not add a generation date, creation date, application ID, internal tracking field, or other workflow metadata to the documents unless the user or the selected template explicitly requires it; keep workflow metadata in the private application state or manifest.
- Use Japanese hiring terminology natural for a mid-career IT role.
- Make the 職務経歴書 achievement-oriented and technically specific.
- Keep the 履歴書 concise and internally consistent with the detailed history.
- Preserve exact dates, employer names, titles, metrics, certifications, and
  language levels from verified facts.
- Mark unresolved placeholders conspicuously and do not submit while they remain.
- Do not invent 志望動機 from generic company praise; connect actual experience
  and motivation to sourced role or company facts.

Place the prepared files plus `evaluation.json` in a temporary directory under
`.job-search/cache/`, then save the current mutable draft:

```powershell
python scripts/job_search.py draft save <application-id> --from <draft-directory> --status working
python scripts/job_search.py draft validate <application-id>
python scripts/job_search.py audit
```

The draft is the only writable application-material state. It may be updated
after user feedback; use the same application and let the CLI increment its
revision. Report the `draft_id`, revision, validation result, strengths, gaps,
and unresolved questions. Ask whether the user wants revisions or intends to
continue with external conversion and submission. Do not paste the full
documents into a chat or the Web dashboard unless the user asks.

If the user requests changes, update the same draft, validate it again, and
report the new revision. There is no confirmed or final-version state, and user
approval of the content must not create a material package. A material package
is an auxiliary immutable snapshot, normally created automatically when a real
submission is recorded. Never edit an existing `packages/` or `submitted/`
directory; restore a package into the mutable draft if its contents must be
revised.

For `shokumu-keirekisho.md`, use the tracked
`templates/ja/shokumu-keirekisho.md` as the canonical default reference. It
follows the Markdown Resume Studio structure without containing candidate
personal data. When the user has no layout preference, follow its heading
levels and order, name/contact placement, bold metadata labels, tables, and
separate `業務内容・工夫` / `成果・実績` sections. If the user prefers another
layout, follow that preference; the template-specific headings, ordering, and
table headers are not mandatory. Run `draft validate` before reporting the
materials as ready. Do not record an exact-file submission while the basic
validation has errors or unresolved `[要確認]` placeholders remain.

For every PDF, visually inspect the rendered pages and run the deterministic
text-layer gate. Supply literal contact details and important Japanese headings
through repeated `--contains` arguments so an icon-only or broken text layer
cannot pass:

```powershell
python scripts/job_search.py document verify-pdf <rirekisho.pdf> --pages 2 --min-chars 200 --contains "履歴書" --contains "candidate@example.com"
python scripts/job_search.py document verify-pdf <shokumu-keirekisho.pdf> --min-chars 500 --contains "職務経歴書" --contains "candidate@example.com"
```

Use the page count required by the employer and chosen format; do not assume all
Japanese 履歴書 or 職務経歴書 must have the same length. The CLI checks page
count, extractable text, required literals, CID markers, and replacement
characters; it does not replace visual inspection.

Only after the user confirms that the exact deliverables were actually sent to
the employer, record the submission and identify the files that were sent:

```powershell
python scripts/job_search.py submit <application-id> --evidence exact_files --file <rirekisho.pdf> --file <shokumu-keirekisho.pdf> --channel <channel> --expected-revision <revision>
python scripts/job_search.py audit
```

When current materials are used, `submit` automatically creates and binds an
immutable material package. Report both the `package_id` and `submission_id`.
Do not create a package merely to represent content approval or a "final
version." Use `package create` only when the user explicitly asks to preserve a
separate immutable snapshot. Submission is an external action and is not
implied by drafting documents; the CLI records a local snapshot and does not
send email or operate a portal.

