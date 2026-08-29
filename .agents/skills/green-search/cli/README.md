# green-cli

CLI for searching IT/Web engineering jobs on Green (green-japan.com), Japan's
IT/Web-focused job board.

**Data source**: Green's category-browsing pages (`/jobtype-l/<code>`) for search; a Next.js embedded JSON payload for detail.
**Authentication**: None required.
**Dependencies**: Node.js 22 or newer with the repository root npm workspace. The CLI
uses Node's built-in `fetch`; `tsx` is supplied by the root development toolchain.

## Installation

From the repository root, install the shared workspace once:

```bash
npm ci
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
npm run portal:green -- search -q "backend" -l "Tokyo" --format table

# Full-stack roles, fully remote
npm run portal:green -- search -q "フルスタック" -l "remote" --format table

# Full detail for one job
npm run portal:green -- detail 9506/294612 --format plain
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
