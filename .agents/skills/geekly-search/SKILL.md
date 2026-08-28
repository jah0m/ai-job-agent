---
name: geekly-search
description: >
  Use this skill whenever the user wants to search for IT engineering jobs in
  Japan on Geekly (geekly.co.jp), a Japan IT-focused career agent / job board.
  Invoke for backend, frontend, full-stack, infrastructure, data, AI/ML, and
  related engineering roles based in Japan (Tokyo, Osaka, remote, etc.), or
  when searching by a specific programming language or technology (Python,
  React, AWS, etc.). Trigger phrases: Geekly jobs, ギークリー, IT転職エージェント,
  IT求人, エンジニア転職, フルスタックエンジニア 求人, プログラマ 転職.
---

# Geekly (geekly.co.jp) Search Skill

Search live IT job listings on Geekly, a Japan IT-focused career agent site
with a deep taxonomy of both job roles and specific technologies/languages.
No authentication, no API key, and **zero runtime dependencies** — it runs
with just `bun`.

## When to use this skill

- Search for engineering job openings in Japan by role (backend, infra, PM,
  QA, AI/ML, etc.) or by specific technology (Python, React, AWS, Docker, ...)
- Search specifically for full-stack roles — Geekly has a dedicated
  "フルスタックエンジニア候補" (full-stack engineer candidate) tag, unlike
  most Japanese job boards which have no full-stack category at all
- Get the full description, required skills, salary, and holiday policy of a
  specific Geekly job listing

## Important limitation: no free-text keyword search

Geekly's `robots.txt` disallows `/*&*&*` (any URL with 2+ ampersands), which
caps how many filters this CLI can combine at once: **at most two**
`data[Search][...]` filters — one from `--query`, one from `--location`.
`--query` is matched against a fixed table of job-role and technology
categories (see below) and mapped to Geekly's `syo_id`/`tyu_id` filter
params. An unmapped query fails with `UNMAPPED_QUERY` and lists the known
categories — it never silently returns empty or wrong results.

Known `--query` categories (English and Japanese both work, exact or
substring match) include role categories (`backend`/`インフラ`/`社内se`/`pm`/
`qa`/`security`/`機械学習`/etc.), languages (`java`, `php`, `python`, `ruby`,
`typescript`, `go`, `c#`, `swift`, `kotlin`, `scala`, `rust`, ...), and
frameworks/cloud (`react`, `vue`, `node.js`, `next.js`, `rails`, `laravel`,
`aws`, `azure`, `gcp`, `docker`, `kubernetes`, ...) — see `SYO_CODES` in
`cli/src/helpers.ts` for the full table (Geekly tracks 150+ categories; this
is a curated subset). `fullstack`/`フルスタック` is special-cased to Geekly's
dedicated full-stack candidate tag rather than a role category.

`--location` accepts a prefecture name (`Tokyo`/`東京`, `Osaka`/`大阪`,
`Kanagawa`, `Chiba`, `Saitama`, `Hyogo`, `Kyoto`, `Aichi`/`Nagoya`,
`Hokkaido`, ...), `remote` (maps to "リモートワーク可" — remote-OK, which
includes hybrid), or `フルリモート` specifically for full-remote-only.

`--jobage` is accepted for CLI-contract consistency but is a no-op — Geekly's
listing pages expose no posting-age filter.

## Commands

### Search job listings

```bash
bun run .agents/skills/geekly-search/cli/src/cli.ts search --query "<role|tech>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Matched against the role/technology table above.
- `--location <text>` / `-l <text>` — prefecture name, `remote`, or `フルリモート`.
- `--jobage <days>` — accepted but unsupported (see above).
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/geekly-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric ID from `search` results (e.g. `842632`), or a full
`geekly.co.jp/search/detail/...` URL. Returns the full job description,
required skills, exact salary text, and holiday policy.

## Usage examples

```bash
# Python roles in Tokyo
bun run .agents/skills/geekly-search/cli/src/cli.ts search -q "python" -l "Tokyo" --format table

# Full-stack candidate roles, remote-OK
bun run .agents/skills/geekly-search/cli/src/cli.ts search -q "フルスタック" -l "remote" --format table

# React roles in Osaka, JSON output
bun run .agents/skills/geekly-search/cli/src/cli.ts search -q "react" -l "Osaka"

# Full detail for a specific listing
bun run .agents/skills/geekly-search/cli/src/cli.ts detail 842632 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Both listing and detail pages are server-rendered HTML, parsed via chunked regex.
- `robots.txt` disallows `/*&*&*` (2+ ampersands — enforced by this CLI's 2-filter cap), `*/limit:*/page:*` and `/page:*/limit:*` (this CLI's pagination uses `page:` alone, never combined with `limit:`, so it is not affected), and a handful of AJAX/account paths not used by this CLI.
- Listing cards do not surface a posting date, so `date` is always `null` in `search` results.
- Job-role/technology/prefecture codes were sourced live from Geekly's own category nav (2026-07-26) — not exhaustive. If a category you need is missing, add it to `SYO_CODES`/`TYU_CODES` in `cli/src/helpers.ts` (open `https://www.geekly.co.jp/search/engineer/` and check the accordion nav's `data[Search][syo_id|tyu_id][code]` links for the exact code).
