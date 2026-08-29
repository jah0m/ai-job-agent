# Development and setup

This guide is for developers working on the repository. End users should start
with the [first-use guide](../user/first-use-guide.md).

## Requirements

- Python 3.11 or newer for the core CLI.
- Optional Python Web dependencies for FastAPI and the local dashboard.
- Node.js/npm for the React frontend.
- Bun for the self-contained portal-search CLIs.

An editable install provides the `job-search` command:

```powershell
python -m pip install -e ".[web,pdf,dev]"
python scripts/job_search.py --help
```

The repository quality gates are the same locally and in CI. They cover every
production module under `src/ai_job_search` and the repository Python helpers;
do not replace them with a partial module check:

```powershell
python -m ruff check src tests scripts
python -m mypy src/ai_job_search
python -m coverage run --branch -m unittest discover -s tests -v
python -m coverage report --show-missing --fail-under=80
python tools/security_guards.py
```

Coverage uses branch measurement and has a repository-wide 80% fail-under
threshold. The full unittest suite is run once under coverage, so a separate
uncovered test run is unnecessary.

## Core CLI

```powershell
python scripts/job_search.py init
python scripts/job_search.py apply --company "Example KK" --role "AI Engineer" --source .\posting.md
python scripts/job_search.py job evidence --portal green --url <detail-url> --snapshot .\.job-search\cache\posting.json --retriever green-search/1
python scripts/job_search.py job validate --portal green --file .\normalized-jobs.json
python scripts/job_search.py job import --portal green --file .\normalized-jobs.json
python scripts/job_search.py job list --status new
python scripts/job_search.py job evaluate <job-id> --file .\.job-search\cache\evaluation.json
python scripts/job_search.py draft save <application-id> --from .\generated --status working
python scripts/job_search.py draft validate <application-id>
python scripts/job_search.py package create <application-id> --expected-revision <revision>
python scripts/job_search.py submit <application-id> --evidence source_only
python scripts/job_search.py audit
```

## Portal CLIs

Portal Skills live under `.agents/skills/<portal>/cli/` and use Bun:

```powershell
bun run .agents/skills/green-search/cli/src/cli.ts search --help
bun run .agents/skills/geekly-search/cli/src/cli.ts search --help
bun run .agents/skills/linkedin-search/cli/src/cli.ts search --help
bun run .agents/skills/tokyodev-search/cli/src/cli.ts search --help
bun run .agents/skills/lapras-search/cli/src/cli.ts search --limit 10
bun run .agents/skills/ats-search/cli/src/cli.ts search --help
```

## Production dashboard

Install dependencies, build the SPA, and use the checked-in production
launcher:

```powershell
python -m pip install -e ".[web]"
Push-Location frontend
npm install
npm run check
npm run build
Pop-Location
& '.agents\skills\job-search-web\scripts\start_web.ps1'
```

Open `http://127.0.0.1:8765`. The launcher does not use Vite's development or
preview servers and does not enable Uvicorn auto-reload.

## Frontend development

The frontend uses Vite, React, TypeScript, plain CSS, Radix UI primitives, and
Biome. `npm run dev` starts Vite on port 5173 and proxies API requests to the
FastAPI service on port 8765. `npm run build` writes the production SPA to
`src/ai_job_search/frontend_dist/`, which FastAPI serves.

## Verification

```powershell
python -m unittest discover -s tests -v
python tools/security_guards.py
Push-Location frontend
npm run check
npm run build
Pop-Location
```

CI also runs the offline Bun suites for LinkedIn, Green, Geekly, TokyoDev,
LAPRAS, and HERP/HRMOS under `.agents/skills/*/cli/`. These portal suites are
independent of the Python Storage-v2 implementation and should remain in the
release gate.

See [architecture](architecture.md) and the [storage model](storage-model.md)
for further implementation context. The complete retriever → evidence → AI
mapping → validation → atomic import contract is documented in
[job discovery and ingestion](job-ingestion.md).
