# Documentation

Documentation is separated by audience so public product guidance does not get
mixed with implementation rules or private product planning.

## Users

- [First-use guide](user/first-use-guide.md): starting AI Job Agent, completing a
  profile, searching jobs, preparing materials, and recording a real external
  submission.

## Developers

- [Architecture](developer/architecture.md): system boundaries and durable
  state transitions.
- [Private storage model](developer/storage-model.md): the ignored workspace
  layout, mutable drafts, immutable packages, and submission snapshots.
- [Development and setup](developer/development.md): dependencies, CLI usage,
  portal CLIs, frontend builds, local development, and tests.
- [Job discovery and ingestion](developer/job-ingestion.md): the portal
  retriever, page-evidence, AI mapping, schema validation, and atomic-import
  boundary.

## AI agents

AI-agent instructions are not user documentation. The repository-level rules
live in [`AGENTS.md`](../AGENTS.md), and task workflows live under
[`.agents/`](../.agents/README.md).

## Private development material

PRDs, design explorations, generated design images, and other material that is
not intended for the public repository belong under `/.private-docs/`. The
entire directory is ignored by Git.
