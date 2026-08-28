# Interview and outcome tracking

Prepare interview material from the archived posting, submitted document
snapshot, candidate evidence, and known interview stage. Store notes beneath
the application's private `interview/` directory.

Prefer a small set of high-quality evidence-backed STAR stories. For each story,
separate situation, responsibility, specific actions, measured result, tradeoffs,
and what the candidate would improve. Flag missing evidence instead of filling
it with plausible details.

Generate questions in four groups: likely technical depth, system or product
judgment, collaboration/leadership, and informed questions for the employer.

Record lifecycle changes with:

```powershell
python scripts/job_search.py status <application-id> interviewing --note "..."
python scripts/job_search.py status <application-id> offer --note "..."
python scripts/job_search.py status <application-id> rejected --note "..."
```

Notes may contain sensitive details and must stay under `.job-search/`. Preserve
the factual outcome and date; distinguish employer feedback from interpretation.

