# geekly-cli

CLI for searching IT jobs on Geekly (geekly.co.jp), a Japan IT-focused career
agent / job board with a deep role and technology taxonomy.

**Data source**: Geekly's `syo_id`/`tyu_id` category-filtered listing pages for search; server-rendered detail pages for `detail`.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/geekly-search/cli
bun install   # optional — only installs TypeScript dev types
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
bun run src/cli.ts search -q "python" -l "Tokyo" --format table

# Full-stack candidate roles, remote-OK
bun run src/cli.ts search -q "フルスタック" -l "remote" --format table

# Full detail for one job
bun run src/cli.ts detail 842632 --format plain
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
