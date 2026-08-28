---
name: tokyodev-search
description: Search public English-friendly software engineering jobs in Japan on TokyoDev (tokyodev.com), including roles that require little or no Japanese, accept overseas applicants, or offer remote work. Use for TokyoDev jobs, English-speaking developer jobs in Japan, no-Japanese-required engineering roles, and Japan tech jobs open from abroad.
---

# TokyoDev Search

Use the bundled zero-dependency Bun CLI to search TokyoDev's public job list or read a public job detail. It is read-only: never submit an application or visit `/c/` or `/frames/` paths.

```powershell
bun run .agents/skills/tokyodev-search/cli/src/cli.ts search --query "backend" --location "remote" --limit 20 --format table
bun run .agents/skills/tokyodev-search/cli/src/cli.ts detail "https://www.tokyodev.com/companies/example/jobs/backend-engineer" --format plain
```

`search` fetches `/jobs` once and filters locally. `--query` and `--location` are optional; `--format` is `json`, `table`, or `plain`. Public detail URLs must match `https://www.tokyodev.com/companies/<company>/jobs/<job>`.

Respect TokyoDev's current robots rules and use low request volume. Return source URLs with results and let the `job-search` skill import selected JSON; do not interpret searching as permission to apply.
