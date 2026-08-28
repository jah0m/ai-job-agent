# Private storage model

```text
.job-search/
  workspace.json
  profile/
    candidate.json
    preferences.json
  applications/
    2026/
      2026-08-26-example-kk-ai-engineer/
        application.json
        source/
          posting.md
        draft/
          manifest.json
          evaluation.json
          rirekisho.md
          shokumu-keirekisho.md
          deliverables/
            rirekisho.pdf
            shokumu-keirekisho.docx
        packages/
          2026-08-26T153012.123456+0900/
            manifest.json
            evaluation.json
            rirekisho.md
            shokumu-keirekisho.md
            deliverables/
              rirekisho.pdf
              shokumu-keirekisho.docx
        submitted/
          2026-08-28T104500.123456+0900/
            submission.json
            files/
        interview/
  interview/
  exports/
  cache/
    imported-details/
    ai-normalized-import/
  trash/
  index.sqlite3
```

The application ID is stable after creation. Timestamp identifiers use local
time with an explicit UTC offset and a filesystem-safe representation. The
SQLite database is an index; application JSON and manifests are the portable
record and remain readable without SQLite.

Each application has one mutable `draft/` working directory. Its manifest
stores the draft ID, revision, source package, validation result, and current
file hashes. Uploaded PDF/DOCX deliverables live under `draft/deliverables/`
and are recorded in the same manifest. AI and Web edits update this directory
and increment `revision`. The draft is never treated as submitted.

`packages/` contains immutable material packages. Recording a submission from current materials automatically creates
a package and records the source draft ID and revision. The current materials
can continue to change without changing the package. `submitted/` copies only
the exact PDF/DOCX files selected by the user and retains the package ID and
file hashes. Source-only and status-only records explicitly store their lower
evidence level instead of claiming exact files.

Discarded drafts and unreferenced deleted packages are moved under `trash/`
instead of being immediately erased. Each application also has an
`interview/` directory for private preparation and outcome notes; the root
`interview/` directory remains available for workspace-level material.

The SQLite index also stores strictly validated, AI-normalized public job
records. The CLI-fetched detail-page snapshot remains under the private
workspace with a verified SHA-256 reference in the normalized source metadata.
Fetched evidence and temporary AI-normalized import files remain separate under
`cache/`; neither is a substitute for a successful `job import` transaction.
Importing the same portal listing again updates its `last_seen_at` rather than
creating a duplicate. Pre-v2 rows remain readable as legacy records. A
discovered job can be linked to a stable application record without losing its
source data. See [job discovery and ingestion](job-ingestion.md) for field and
provenance rules.

AI-authored discovered-job evaluations are append-only rows in the SQLite
index. Each row retains hashes of the candidate profile, preferences, and job
source used for the analysis. The dashboard reads the latest row and marks it
stale when any of those inputs have changed; it never synthesizes match claims
from keyword overlap.
