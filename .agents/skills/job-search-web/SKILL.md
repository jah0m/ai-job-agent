---
name: job-search-web
description: Start or open the local AI Job Agent Web dashboard in normal production mode. Use when the user asks to launch, start, run, or open the job-search Web UI or AI Job Agent. Never use a Vite development server, preview server, auto-reload, or port 5173.
---

# Job Search Web

Start the repository's built React application through FastAPI on local port
8765, then open it for the user. Keep personal data under `.job-search/`.

## Production-only boundary

Do not use any of the following:

- `npm run dev`, `vite`, or port 5173;
- `npm run preview` or `vite preview`;
- Uvicorn's `--reload` option;
- `python scripts/job_search_web.py`, because that entrypoint currently enables
  `reload=True`.

`npm run build` is allowed when the production frontend has not been built. It
creates the static application served by FastAPI; it does not start a
development server.

## Start AI Job Agent

First request `http://127.0.0.1:8765/health`. If it returns successfully, do not
start a duplicate process; open `http://127.0.0.1:8765` and report that Job
Atlas was already running.

If the Web dependencies are missing, install the repository's documented
optional dependencies:

```powershell
python -m pip install -e ".[web]"
```

If `src/ai_job_search/frontend_dist/index.html` is missing, build the production
frontend:

```powershell
Push-Location frontend
npm install
npm run build
Pop-Location
```

Then run the checked-in launcher from the repository root:

```powershell
& '.agents\skills\job-search-web\scripts\start_web.ps1'
```

The launcher initializes `.job-search/` when needed, starts a hidden local
background process without reload, waits for the health endpoint, and writes
logs under `.job-search/`.

After health succeeds, open `http://127.0.0.1:8765` with the available browser
capability. If no browser capability is available, return a clickable URL.

Report the result with short bullets containing the URL, production-mode
status, and log locations. On failure, inspect the error log and address only
the concrete missing dependency, missing build, or port conflict. Do not fall
back to a development or preview server.
