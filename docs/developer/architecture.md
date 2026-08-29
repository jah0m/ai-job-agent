# Architecture

The product deliberately separates AI reasoning, user interfaces, and durable
state transitions.

```text
Codex conversation
  -> .agents/skills/job-search (workflow and quality rules)
  -> portal retriever -> page evidence -> AI field mapping
  -> job-search CLI -------------------------+
                                               |
Browser -> React SPA -> FastAPI Web routes ----+-> Storage-v2 services
                                                    -> SQLite metadata authority
                                                    -> SHA-256 object store
```

Codex fetches or reads unstructured job postings and semantically maps source
facts into a normalized job record with field-level evidence. The CLI does not
pretend to be an AI model: it validates and persists that AI-normalized source
record, creates application identities, preserves source material, advances a
mutable current-draft pointer across immutable revisions, freezes immutable
material packages and submissions, records status events and AI-authored job evaluations, exports
metadata, and verifies hashes. The CLI validates and stores the structured
evaluation; it does not generate the reasoning itself.

The discovered-job import boundary is strict. Portal CLIs retrieve public
detail-page evidence into `.job-search/operations/<operation-id>/`; `job evidence` canonicalizes
the source URL and hashes that snapshot. AI emits only supported v2 fields,
omitting page facts that are absent or unreliable. `job validate` and `job
import` both run JSON Schema, provenance, and cross-field validation. Import
validates the complete batch before beginning its database transaction.
Current SQLite rows remain readable after restart but cannot bypass the new
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
the SQLite database, and the content-addressed object store.

## Safety properties

- Draft edits create immutable revisions and use compare-and-swap concurrency;
  only the current-revision pointer is mutable.
- Artifacts are written, fsynced, verified, and atomically renamed before a
  database transaction may reference them.
- Identical source and generated artifacts are stored once by SHA-256.
- Material packages reference their exact source draft revision and are
  protected by database immutability triggers.
- Submissions reference an immutable material package and exact artifact hashes,
  except for explicit status-only records.
- Paths supplied to the CLI cannot escape the private workspace.
- Uploaded deliverables are restricted by filename, size, and supported media
  type; private downloads are served with no-store cache controls.

Storage-v2 implementation is intentionally split into a small compatibility
layer plus focused modules under `src/ai_job_search/storage/`: shared
contracts/utilities, content-addressed objects, SQLite schema/connection,
profile/preferences, jobs/evaluations, applications, drafts,
packages/submissions, and audit/GC/export. `facade.py` composes these services;
`storage_v2.py` and `workspace.py` preserve stable imports. The dependency
direction is infrastructure first, domain operations second, facade last. The
domain mixins share a narrow internal port without a circular import.
