# Architecture

The product deliberately separates AI reasoning, user interfaces, and durable
state transitions.

```text
Codex conversation
  -> .agents/skills/job-search (workflow and quality rules)
  -> portal retriever -> page evidence -> AI field mapping
  -> job-search CLI -------------------------+
                                               |
Browser -> React SPA -> FastAPI Web routes ----+-> Workspace methods
                                                    -> .job-search/
                                                       private files + SQLite index
```

Codex fetches or reads unstructured job postings and semantically maps source
facts into a normalized job record with field-level evidence. The CLI does not
pretend to be an AI model: it validates and persists that AI-normalized source
record, creates application identities, preserves source material, manages a
mutable current-materials area, freezes immutable material packages and
submissions, records status events and AI-authored job evaluations, exports
metadata, and verifies hashes. The CLI validates and stores the structured
evaluation; it does not generate the reasoning itself.

The discovered-job import boundary is strict. Portal CLIs retrieve public
detail-page evidence into `.job-search/cache/`; `job evidence` canonicalizes
the source URL and hashes that snapshot. AI emits only supported v2 fields,
omitting page facts that are absent or unreliable. `job validate` and `job
import` both run JSON Schema, provenance, and cross-field validation. Import
validates the complete batch before beginning its database transaction.
Existing pre-v2 rows remain readable as legacy data but cannot bypass the new
import boundary. See [job discovery and ingestion](job-ingestion.md) for the
retriever/AI responsibilities, normalization rules, and validation contract.

The React dashboard reads JSON from FastAPI and sends user-authorized changes
back through CSRF-protected Web routes. Both the Web routes and CLI call the
same `Workspace` methods, so neither interface owns a separate state model.
FastAPI also serves the production SPA and private file previews/downloads.

This boundary makes conversations replaceable. A fresh Codex task can recover
the authoritative context from the private workspace without needing the old
chat transcript.

## Tracked versus private

Tracked: Skills, code, schemas, blank templates, tests, documentation, and
licenses.

Private and ignored: candidate facts, contact details, preferences, job
postings, evaluations, generated resumes, interview notes, outcomes, exports,
and the SQLite index.

## Safety properties

- Draft edits are revisioned and optimistic-concurrency checked; a draft is the
  only mutable application-material state.
- Material-package directories are created atomically and never overwritten.
- Source and generated artifacts are copied rather than referenced in place.
- Manifests contain SHA-256 hashes for later integrity checks.
- Material-package manifests point back to their source draft ID and revision.
- Submission snapshots point back to an immutable material package, except for
  explicit status-only records.
- Paths supplied to the CLI cannot escape the private workspace.
- Uploaded deliverables are restricted by filename, size, and supported media
  type; private downloads are served with no-store cache controls.
