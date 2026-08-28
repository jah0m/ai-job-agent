---
name: green-search
description: >
  Use this skill whenever the user wants to search for IT/Web engineering jobs
  in Japan on Green (green-japan.com), Japan's largest IT/Web-focused job board.
  Invoke for backend, frontend, full-stack, infrastructure, mobile, data, QA,
  and related engineering roles based in Japan (Tokyo, Osaka, remote, etc.).
  Trigger phrases: Green Japan jobs, IT engineer jobs Japan, 転職, 求人,
  エンジニア求人, グリーン 転職, IT/Web業界 求人, フルスタックエンジニア 求人.
---

# Green (green-japan.com) Search Skill

Search live IT/Web engineering job listings on Green, one of Japan's largest
IT/Web-focused job boards (28,600+ listings at last check). No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`.

## When to use this skill

- Search for engineering job openings in Japan by role (backend, frontend,
  full-stack, infra, mobile, data, QA, PM, etc.) and optionally by prefecture
  or full-remote
- Get the full description, requirements, and salary detail of a specific
  Green job listing

## Important limitation: no free-text keyword search

Green's `robots.txt` disallows `/search?` (its query-string search endpoint),
so this CLI **cannot** do arbitrary keyword search. Instead, `--query` is
matched against a fixed table of job-type categories (see below) and mapped
to Green's `/jobtype-l/<code>` category-browsing paths, which are not
disallowed. An unmapped query fails with `UNMAPPED_QUERY` and lists the
known categories — it never silently returns empty or wrong results.

Known `--query` categories (English and Japanese both work, exact or
substring match): `backend`/`バックエンド`, `fullstack`/`フルスタック`
(Green has no dedicated full-stack category — this maps to backend, the
closest general development category), `frontend`/`フロントエンド`,
`mobile`/`スマホアプリ`, `infra`/`インフラ`, `network`/`ネットワーク`,
`embedded`/`組み込み`, `middleware`, `pm`/`プロジェクトマネージャー`,
`社内se`, `product manager`/`プロダクトマネージャー`, `consultant`,
`data scientist`/`データサイエンティスト`, `qa`/`品質保証`.

`--location` accepts a prefecture name (`Tokyo`/`東京`, `Osaka`/`大阪`,
`Kanagawa`, `Chiba`, `Saitama`, `Hyogo`, `Kyoto`, `Aichi`/`Nagoya`,
`Hokkaido`, `Fukuoka`, ...) or `remote` for Green's "フルリモート"
(full-remote) filter. An unmapped location fails the same way, listing
known areas.

`--jobage` is accepted for CLI-contract consistency but is a no-op — Green's
category pages expose no posting-age filter.

## Commands

### Search job listings

```bash
bun run .agents/skills/green-search/cli/src/cli.ts search --query "<job type>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Matched against the job-type table above.
- `--location <text>` / `-l <text>` — prefecture name or `remote`.
- `--jobage <days>` — accepted but unsupported (see above).
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/green-search/cli/src/cli.ts detail <companyId/jobId|url> [--format json|plain]
```

`id` is `<companyId>/<jobId>` from `search` results (e.g. `9506/294612`), or a
full `green-japan.com/company/.../job/...` URL. Detail pages are parsed from
Green's embedded Next.js JSON payload (not HTML scraping), so the result
includes the full description, required/preferred qualifications, exact
salary breakdown, employment type, and tech tags.

## Usage examples

```bash
# Backend roles in Tokyo
bun run .agents/skills/green-search/cli/src/cli.ts search -q "backend" -l "Tokyo" --format table

# Full-stack roles, fully remote
bun run .agents/skills/green-search/cli/src/cli.ts search -q "フルスタック" -l "remote" --format table

# Infrastructure roles in Osaka, JSON output
bun run .agents/skills/green-search/cli/src/cli.ts search -q "infra" -l "Osaka"

# Full detail for a specific listing
bun run .agents/skills/green-search/cli/src/cli.ts detail 9506/294612 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Listing pages are Green's legacy server-rendered HTML (parsed via chunked regex); detail pages are a newer Next.js app whose full job record is read directly from embedded JSON — no HTML scraping needed for `detail`.
- `robots.txt` disallows `/search?`, `/api/v2`, and a fixed list of ~50 specific legacy `/job/{id}` and `/company/{id}` pages (not the `/company/{cid}/job/{jid}` pattern this CLI uses). Category-browsing paths (`/jobtype-l/`, `area_id`/`job_feature_id` query params) are not disallowed.
- Job/area/feature codes were sourced live from Green's own category nav and filter `<select>` elements (2026-07-26) — not exhaustive. If a category or prefecture you need is missing, add it to `JOBTYPE_CODES`/`AREA_CODES` in `cli/src/helpers.ts` (open a listing page and check the `job_high`/`area_id` `<select>` options for the exact code).
