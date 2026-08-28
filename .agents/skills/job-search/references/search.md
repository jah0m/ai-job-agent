# Search and triage jobs

Use the portal Skills for live discovery. Prefer low-volume, targeted searches
that respect each site's documented limitations:

```powershell
bun run .agents/skills/green-search/cli/src/cli.ts search -q "backend" -l "Tokyo" --limit 20 --format json
bun run .agents/skills/geekly-search/cli/src/cli.ts search -q "AI" -l "remote" --limit 20 --format json
bun run .agents/skills/linkedin-search/cli/src/cli.ts search -q "AI Engineer" -l "Tokyo, Japan" --jobage 14 --limit 20 --format json
bun run .agents/skills/tokyodev-search/cli/src/cli.ts search --query "backend" --location "remote" --limit 20 --format json
bun run .agents/skills/lapras-search/cli/src/cli.ts search --limit 10 --format json
bun run .agents/skills/ats-search/cli/src/cli.ts search --provider herp --company <slug> --query "AI" --limit 20 --format json
bun run .agents/skills/ats-search/cli/src/cli.ts search --provider hrmos --company <slug> --query "エンジニア" --limit 20 --format json
```

Save JSON output under `.job-search/cache/`, then import it into the private
index:

```powershell
python scripts/job_search.py job import --portal green --file <results.json>
python scripts/job_search.py job list --status new
python scripts/job_search.py job status <job-id> saved
python scripts/job_search.py job status <job-id> skipped
```

The import is idempotent by portal and listing identity/URL. Re-importing updates
the last-seen time without creating a duplicate. Keep raw results private.

Before creating an application, inspect the full posting and run the evaluation
workflow. Persist the AI-authored analysis so the Web dashboard can display it:

```powershell
python scripts/job_search.py job evaluate <job-id> --file .job-search/cache/evaluation.json
```

A chat summary or Markdown export alone is not a saved evaluation. Only after
the user decides to track an application should you create the durable
application from the indexed result:

```powershell
python scripts/job_search.py job apply <job-id>
```

Do not treat an indexed listing as currently open without a fresh detail check.
Do not bulk scrape, bypass authentication, or evade rate limits.

TokyoDev fetches one public list and filters locally. HERP and HRMOS require a
known company slug because they do not expose a public cross-company index.
LAPRAS's internal search and detail APIs require login, so its CLI lists public
URLs from the sitemap. For keyword discovery, use normal internet search
restricted to `site:lapras.com/jobs`, then verify each URL against the sitemap.
