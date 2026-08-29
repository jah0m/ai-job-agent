# Storage v2

Storage v2 has one explicit authority rule:

> SQLite is the sole authority for business metadata, versions, relationships,
> and state transitions. The filesystem stores only immutable content objects,
> temporary operation input, exports, backups, and recoverable trash.

## Layout

```text
.job-search/
  workspace.sqlite3
  objects/
    sha256/
      ab/
        cdef...                 # object hash is abcdef...
  operations/
    <operation-id>/             # temporary Codex/CLI exchange files
  cache/                        # optional staging input; not created by v2
  exports/
  backups/
  trash/
    objects/
```

Fresh workspaces do not create `workspace.json`, profile JSON, application
directories, draft manifests, package directories, or submission directories.
Current profile, application, draft, package, and submission records are stored
in SQLite instead.

## Versioned metadata

Candidate profiles and preferences are immutable version rows. `workspace_state`
points to their current versions. Updating either creates a new version; existing
job evaluations continue to reference the exact input versions they used.

Each discovered job has immutable `job_versions`. A version contains the
normalized JSON and references the immutable source snapshot artifact. `jobs`
contains only identity, triage state, and a pointer to the current version.

Job evaluations are append-only and reference an exact job version, profile
version, and preference version. Staleness is an ID comparison rather than a
best-effort hash comparison against mutable files.

## Content-addressed artifacts

Original postings, Markdown sources, PDF/DOCX deliverables, and other artifacts
are stored once under `objects/sha256/`. The database records their SHA-256,
size, media type, and logical references.

The write protocol is deliberately asymmetric:

1. write and fsync a temporary object;
2. atomically rename it to its SHA-256 path;
3. begin the SQLite business transaction;
4. insert artifact metadata and domain references;
5. commit.

A crash before step 5 can leave only an unreferenced object, which is safe and
reported by `job-search audit`. It cannot leave a committed database reference
to a partially written object. `job-search gc` previews unreferenced registered
objects; `job-search gc --apply` moves them to recoverable trash.

## Drafts, packages, and submissions

A draft is represented by a current-revision pointer. Every save creates an
immutable `draft_revision` plus artifact references. Concurrent writers use a
compare-and-swap update on the expected revision.

A material package freezes the exact artifact-reference set of one draft
revision. A submission references a package and, for `exact_files`, the exact
selected artifact hashes. No files are copied between draft, package, and
submission states.

Database triggers reject updates to version rows, package files, evaluations,
and submissions. Deleting an unsubmitted package is a soft deletion; its
immutable history and objects remain available for audit and recovery.

## Temporary JSON lifecycle

Codex may create source snapshots, normalized import JSON, and evaluation JSON
under `.job-search/operations/<operation-id>/`. The `.job-search/cache/`
location remains accepted for staged input.

- `job validate` is read-only and never consumes input.
- successful `job import` consumes a staged normalized JSON file and all staged
  source snapshots after committing the database transaction;
- successful `job evaluate` consumes its staged evaluation JSON;
- validation, import, or evaluation failures keep every input file;
- inputs outside `operations/` and `cache/` are never deleted;
- `--keep-input` disables successful-input cleanup.

## Initialization

Initialization creates the required workspace directories and applies the
Storage-v2 schema idempotently. An existing `workspace.sqlite3` is opened and
updated in place; its rows and content objects are not replaced. Initialization
does not inspect or import older workspace files or databases. Any data move
from an older format must be an explicit, separately reviewed operation.

See [Storage-v2 acceptance criteria](storage-v2-acceptance.md) for the required
behavioral and failure gates.

## Implementation boundaries

The public `ai_job_search.workspace` module and the historical
`ai_job_search.storage_v2` path are compatibility export layers. The
implementation is composed under `src/ai_job_search/storage/` with a one-way
dependency direction:

```text
common.py  ->  objects.py
     \          /
      database.py  ->  domain mixins
                         |-- profile.py
                         |-- artifacts.py
                         |-- jobs.py
                         |-- applications.py
                         |-- drafts.py
                         |-- packages.py
                         `-- integrity.py
                                      ^
                                  facade.py
```

`common.py` owns constants, canonical JSON, timestamps, hashes, and workspace
errors. `objects.py` owns atomic content-addressed writes. `database.py` owns
the SQLite connection, schema, triggers, and initialization. Domain mixins use
that infrastructure and call each other only through the composed facade's
documented internal operations; they do not import `facade.py` or form
domain-to-domain import cycles. `contracts.py` defines the narrow
`StorageDomainPort` used for those internal collaborations without importing
the facade dynamically.
