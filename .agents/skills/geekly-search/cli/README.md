# geekly-cli

CLI for searching IT jobs on Geekly (geekly.co.jp), a Japan IT-focused career
agent / job board with a deep role and technology taxonomy.

**Data source**: Geekly's `syo_id`/`tyu_id` category-filtered listing pages for search; server-rendered detail pages for `detail`.
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
| `search` | Search job listings by role or technology (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Python roles in Tokyo
npm run portal:geekly -- search -q "python" -l "Tokyo" --format table

# Full-stack candidate roles, remote-OK
npm run portal:geekly -- search -q "フルスタック" -l "remote" --format table

# Full detail for one job
npm run portal:geekly -- detail 842632 --format plain
```

See `../SKILL.md` for the full flag reference and the role/technology category tables.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Matched against a fixed role/technology category table — Geekly has no free-text search. |
| `--location` | `-l` | Prefecture name (e.g. `"Tokyo"`, `"大阪"`), `"remote"`, or `"フルリモート"`. |
| `--jobage` | | Accepted but unsupported — no-op. |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Note on robots.txt

Geekly's `robots.txt` disallows any URL with 2+ ampersands. This CLI never
combines more than two `data[Search][...]` filters (one from `--query`, one
from `--location`), so it always stays within that limit.
