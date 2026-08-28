# Candidate profile

The authoritative private files are:

- `.job-search/profile/candidate.json`: identity, contact details, experience,
  education, skills, languages, and evidence-backed accomplishments.
- `.job-search/profile/preferences.json`: target roles, locations, work style,
  compensation, hard constraints, soft preferences, and
  `blacklisted_companies`.

`blacklisted_companies` is a list of employer names the candidate does not want
to pursue. Preserve it when updating preferences and use it to exclude or flag
matching companies during job search and triage.

Initialize the workspace with `python scripts/job_search.py init`. Populate the
profile from an existing CV when supplied; otherwise ask only for missing facts
needed by the current task.

Never edit either authoritative JSON file directly. Read the current values,
prepare a complete replacement JSON file under `.job-search/cache/`, and persist
it through the validated CLI:

```powershell
python scripts/job_search.py profile show
python scripts/job_search.py profile update --file .job-search/cache/candidate-update.json
python scripts/job_search.py preferences show
python scripts/job_search.py preferences update --file .job-search/cache/preferences-update.json
```

The update commands atomically replace the corresponding document after
structural validation and set the current `schema_version`. Preserve existing
facts and fields that the user did not ask to change. User edits through Job
Atlas Web are also valid because they use the same `Workspace` update methods.

Keep claims atomic and reusable. Store evidence for quantified achievements:
what changed, the candidate's action, the measurement, and any uncertainty.
Never strengthen a title, skill level, result, employment date, language level,
or leadership scope beyond the supplied evidence.

Contact details and real employment history must not be copied into tracked
examples, templates, Skills, or project instructions.
