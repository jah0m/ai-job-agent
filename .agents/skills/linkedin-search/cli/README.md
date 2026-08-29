# linkedin-cli

CLI for searching jobs on LinkedIn's public job listings, for **any country/region**
(and remote), across any sector.

**Data source**: LinkedIn `jobs-guest` endpoints (`seeMoreJobPostings/search` and `jobPosting/<id>`).
**Authentication**: None required.
**Dependencies**: Node.js 22 or newer with the repository root npm workspace. The CLI
uses Node's built-in `fetch`; `tsx` is supplied by the root development toolchain.

> **Personal use only.** This uses LinkedIn's public job pages; automated access is against
> LinkedIn's Terms of Service. Keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility.

## Installation

From the repository root, install the shared workspace once:

```bash
npm ci
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--location` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Software roles in Hyderabad, last 7 days
npm run portal:linkedin -- search -q "backend engineer" -l "Hyderabad, Telangana, India" --jobage 7 --format table

# Design roles in London
npm run portal:linkedin -- search -q "product designer" -l "London, United Kingdom" --format table

# Fully remote
npm run portal:linkedin -- search -q "technical writer" -l "Remote" --remote remote --format table

# Full detail for one job
npm run portal:linkedin -- detail 4426311357 --format plain
```

See `../SKILL.md` for the full flag reference and the Terms-of-Service note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--location` | `-l` | **Required.** Place string, e.g. `"Mumbai, Maharashtra, India"`, `"Berlin, Germany"`, `"Remote"`. |
| `--query` | `-q` | Keywords (title / skill / role). Recommended. |
| `--jobage` | | Posted within N days: `1`, `7`, `14`, `30`. |
| `--remote` | | `remote` \| `hybrid` \| `onsite`. |
| `--page` | | 1-indexed page (10 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
