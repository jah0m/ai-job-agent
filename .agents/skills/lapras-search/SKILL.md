---
name: lapras-search
description: Search publicly visible engineering jobs on LAPRAS (lapras.com) or read a specific public LAPRAS job. Use for LAPRAS jobs, ラプラス 求人, エンジニア求人, AI・Web・software engineering roles listed on LAPRAS, and public LAPRAS job URLs.
---

# LAPRAS Search

Use the zero-dependency Bun CLI for public, read-only research.

```powershell
bun run .agents/skills/lapras-search/cli/src/cli.ts search --limit 10 --format table
bun run .agents/skills/lapras-search/cli/src/cli.ts detail 12118 --format plain
```

LAPRAS's internal search and detail APIs require login, while public job URLs
are client-rendered. Do not call those APIs or bypass authentication. The CLI's
`search` command lists current public job IDs and URLs from the public sitemap;
it deliberately rejects `--query` instead of returning misleading empty data.
For keyword discovery, use normal internet search restricted to
`site:lapras.com/jobs`, then confirm that each URL is present in the public
sitemap. `detail` accepts a numeric ID or public URL and returns public URL
metadata; use internet search/page rendering for the indexed description.

Return source URLs and use `job-search` only when the user asks to track/import a selected listing. Never submit applications.
