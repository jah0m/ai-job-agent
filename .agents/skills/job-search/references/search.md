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

Save JSON output under `.job-search/operations/<operation-id>/` as a discovery candidate. Before
importing a selected result, read [references/ingest.md](ingest.md), fetch the
full detail page, and let AI produce the normalized source record. Portal
search output is not a complete posting and must not be treated as the final
import shape. The normalized `description` is a short AI summary of the role's
actual duties; never put fetched HTML or the full posting into that field.

Read `blacklisted_companies` from the saved job-search preferences before
triage. Exclude matching employers from recommendations when the match is
clear; if the company name is ambiguous, flag it for confirmation instead of
silently treating it as a match.

Direct URL import is also a recommended first-class workflow. When the user
provides a public job-detail URL and asks to import or save it, skip discovery
search, follow [references/ingest.md](ingest.md), and persist the validated job
with status `new`. Do not treat login pages, application forms, referral URLs,
or tracking links as job-detail sources.

Then import the AI-normalized JSON into the private index:

```powershell
python scripts/job_search.py job validate --portal green --file <normalized-jobs.json>
python scripts/job_search.py job import --portal green --file <normalized-jobs.json>
python scripts/job_search.py job list --status new
python scripts/job_search.py job status <job-id> saved
python scripts/job_search.py job status <job-id> skipped
```

## Discovery and saved-state semantics

Importing a selected result persists it in the workspace with the default
status `new`. In this workflow, a user request such as `保存`, "save", "record
it", or "add it to the workspace" means persist/import the result and leave it
as `new`. Do not run `job status <job-id> saved` for those requests.

Change a job from `new` to `saved` only when the user explicitly asks to
favorite it, mark it as saved, or set its status to `saved` (`收藏`, `已收藏`, or
equivalent wording). If the user asks to find a specific number of jobs, import
the selected jobs as `new` unless they explicitly request a preview with no
workspace changes.

Whenever the response includes an AI-authored fit conclusion for a discovered
job, persist that analysis with `job evaluate` before claiming the workflow is
complete. Verify the resulting job status and evaluation from local state; do
not attribute a missing dashboard item to the Web service without a successful
service-health or API check that demonstrates the failure.

The import is idempotent by portal and listing identity/URL. Re-importing updates
the last-seen time without creating a duplicate. Keep discovery output and
fetched posting evidence private.

Before creating an application, inspect the full posting and run the evaluation
workflow. Persist the AI-authored analysis so the Web dashboard can display it:

```powershell
python scripts/job_search.py job evaluate <job-id> --file .job-search/operations/<operation-id>/evaluation.json
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
