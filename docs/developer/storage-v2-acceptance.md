# Storage-v2 acceptance criteria

Storage v2 is accepted only when every item below has direct automated or
inspection evidence for the current implementation.

## A. Authority and layout

- A fresh workspace creates `workspace.sqlite3`, `objects/`, `operations/`,
  `exports/`, `backups/`, and `trash/`.
- It does not create live profile, application, draft, package, or submission
  JSON records.
- Profile/preferences, jobs, evaluations, applications, status events, draft
  revisions, packages, and submissions are queryable from SQLite after restart.
- Re-running initialization preserves an existing `workspace.sqlite3` and its
  records; initialization does not import other workspace files or databases.
- Web and CLI use the same Storage-v2 service.

Evidence: `test_sqlite_is_the_only_live_metadata_authority`, CLI lifecycle, and
Web goal-flow tests.

## B. Artifact safety

- Every persisted content file is addressed by its SHA-256 and verified after
  its atomic object-store write.
- Draft, package, and submission references to identical bytes use one artifact
  row and one object file.
- The database never references an object that was not fully written first.
- A simulated database rollback after object creation leaves only a reportable,
  collectable orphan.
- Audit detects missing, size-mismatched, or hash-mismatched referenced objects.

Evidence: object reuse, injected-failure, tamper, audit, and GC tests.

## C. Versioning and immutability

- Candidate profiles, preferences, job versions, evaluations, draft revisions,
  material package files, and submissions are immutable rows.
- Updating profile/preferences or the current job version marks older
  evaluations stale through version references.
- Draft updates use compare-and-swap and reject a stale expected revision.
- Packages identify their exact source draft revision.
- Exact-file submissions identify their package and exact artifact hashes.
- SQLite triggers reject direct mutation of immutable package/submission data.

Evidence: evaluation, revision-conflict, package/submission, and immutability
tests.

## D. Temporary JSON

- Validation never deletes or persists a staged input.
- Successful staged import removes normalized JSON and its staged source
  snapshot only after commit.
- Successful staged evaluation removes its input only after commit.
- Invalid/failed input remains for diagnosis.
- Files outside the workspace staging roots are never consumed.
- `--keep-input` preserves successful staged input.

Evidence: successful/failed staged import and CLI evaluation tests.

## E. Required release gates

Run from the repository root:

```powershell
python -m ruff check src tests scripts
python -m mypy src/ai_job_search
python -m coverage run --branch -m unittest discover -s tests -v
python -m coverage report --show-missing --fail-under=80
python tools/security_guards.py
npm run check:frontend
npm run build:frontend
npm run typecheck:portals
npm run test:portals
```

Run every portal CLI offline suite listed in `.github/workflows/ci.yml`. All
commands must exit zero. Then create a clean temporary workspace, complete the
CLI lifecycle, run `job-search audit`, and confirm:

- `ok` is true;
- `sqlite_integrity` is `ok`;
- `errors` is empty;
- no unexpected pending operation exists.

For an existing private workspace, make a backup before running schema updates.
Initialization must preserve the existing `workspace.sqlite3` and its content
objects; it does not import files from another workspace format.
