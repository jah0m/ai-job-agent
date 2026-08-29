---
name: job-search-onboarding
description: Guide first-time users of this Japanese job-search workspace through private initialization and the minimum candidate profile and preferences needed to begin. Use for a generic initial greeting with no stated task, first use, getting started, onboarding, 初めて使う, or 初回設定. Do not use for routine profile revisions or generic career advice.
---

# Job Search Onboarding

Help the user reach a useful first outcome without presenting a long setup form.
Keep all personal facts and preferences under `.job-search/`; never place them
in tracked Skills, examples, templates, or documentation.

Before reading or changing candidate data, read
[the canonical profile workflow](../job-search/references/profile.md). Use the
existing `job-search` workflow and CLI for persistence rather than defining a
second profile format here.

## Establish the starting point

Use `python scripts/job_search.py profile show` and `preferences show` to read
the current records from Storage v2. Do not ask for facts that are already
recorded. Persist complete replacements with `profile update --file` and
`preferences update --file`. JSON passed to these commands is an interchange
or staged input, not an authoritative live record; never edit profile JSON
directly.

If `.job-search/` is absent, initialize it with:

```powershell
python scripts/job_search.py init
```

Briefly explain that the workspace keeps private state locally. The Web
dashboard displays and manages that state, while Codex assists with search,
evaluation, and documents. Neither onboarding nor document generation submits
an application to an employer.

## Respond to an initial greeting

When the user only greets Codex or has not stated a task, do not compress the
workspace into a sentence containing a long inline list. Give a short welcome,
then use bullets to show the implemented workflow:

- start or open the local AI Job Agent dashboard in production mode through the
  `job-search-web` skill;
- create or complete the candidate profile and job preferences;
- search supported job portals;
- save jobs and analyze fit with evidence-backed strengths and gaps;
- track applications and their status;
- prepare revisioned current Japanese 履歴書 and 職務経歴書, with immutable
  material packages when a snapshot is needed;
- prepare for interviews and record outcomes.

End with one or two concrete starter requests as bullets. For a new user,
recommend starting AI Job Agent and then setting up their profile or importing an
existing CV. Use the `job-search-web` skill when the user chooses the Web
option; do not reproduce or improvise its process-launch commands. Mention
concisely that data remains local and no application is sent automatically.
Match the user's language.

## Guide the conversation

Start with the smallest information set that enables the user's immediate next
step. Ask one coherent group of questions at a time and accept partial answers.

- For job discovery, prioritize target roles, preferred locations, work style,
  and hard constraints. Then collect enough recent experience, skills, and
  language information to judge likely fit.
- If the user supplies an existing CV or resume, extract candidate facts from
  it first and ask only about missing or ambiguous items.
- Defer identity and contact details until they are needed for application
  documents unless the user wants to complete them now.
- Keep verified facts separate from inferred positioning. Confirm any material
  inference before persisting it.
- Do not require the profile to be exhaustive before producing a useful first
  result.

Use Japanese for the profile, preferences, and user-facing onboarding unless
the user requests another language. Preserve official names and useful English
technology and job-title keywords.

## Finish with a handoff

Summarize what is recorded, identify the few missing facts that would most
improve the next task, and offer one or two concrete next actions. Prefer a
real first outcome such as searching a suitable portal or evaluating a supplied
job over a generic tour of every feature.

When an existing profile is already sufficient, skip onboarding and continue
directly to the user's requested job-search task.
