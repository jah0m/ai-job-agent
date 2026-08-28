# green-cli

CLI for searching IT/Web engineering jobs on Green (green-japan.com), Japan's
IT/Web-focused job board.

**Data source**: Green's category-browsing pages (`/jobtype-l/<code>`) for search; a Next.js embedded JSON payload for detail.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/green-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings by job-type category (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Backend roles in Tokyo
bun run src/cli.ts search -q "backend" -l "Tokyo" --format table

# Full-stack roles, fully remote
bun run src/cli.ts search -q "フルスタック" -l "remote" --format table

# Full detail for one job
bun run src/cli.ts detail 9506/294612 --format plain
```

See `../SKILL.md` for the full flag reference and the job-type/area category tables.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Matched against a fixed job-type category table — Green has no free-text search. |
| `--location` | `-l` | Prefecture name (e.g. `"Tokyo"`, `"大阪"`) or `"remote"`. |
| `--jobage` | | Accepted but unsupported — no-op. |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
