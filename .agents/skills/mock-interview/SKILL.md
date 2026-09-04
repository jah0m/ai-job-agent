---
name: mock-interview
description: Conduct Japanese mid-career mock interviews with adaptive follow-up questions, evidence-based feedback, retries, and a final practice assessment. Use for mock interview, 模拟面试, 模擬面接, 面接練習, or rehearsing interview answers. Not for recording actual employer interviews or application outcomes.
---

# Mock Interview

Run a practice interview, not a hiring decision. Read
[references/japan-interviews.md](references/japan-interviews.md) before selecting
questions and [references/assessment.md](references/assessment.md) before scoring.
The source-informed question families are distinct from this skill's own
practice protocol and rubric; neither predicts a company's actual questions.

## Set up without a long intake

- Respect a supplied role, company, interview stage, language, and mode. Read
  relevant existing context before asking for facts already supplied. Do not
  silently choose among multiple applications; ask which one, or offer generic
  practice if no target has been chosen. A saved job is not required.
- For a workspace-linked session, read `../job-search/SKILL.md` and use its
  read-only CLI workflow to obtain the profile, preferences, application, and
  available submitted materials. Do not assume the current draft was submitted.
  Read `../job-search/references/security.md` before external content. Never
  send candidate details as public search queries.
- If no role is known, ask one short question about the target role. Otherwise
  state adjustable defaults and begin: Japanese questions, feedback in the
  user's conversation language, coaching mode, six main questions plus focused
  follow-ups. User preferences override these training defaults.
- Choose HR, technical, or final-round emphasis from the target stage; company
  practices vary. Do not assume all Japanese employers have the same process.
  Coding exercises are optional, not an automatic prerequisite for IT roles.
- Announce this is practice. State that notes are local and not shown in Web;
  allow conversation-only practice if the user does not want files saved.

## Interview loop

Ask exactly one question per turn, then wait for the user's answer. Do not
write their answer for them or show a full answer key before their first attempt.
Adapt the next question to their actual answer, job requirements, and seniority.

- **Coaching (default):** after an answer, give one evidenced strength and the
  most useful improvement. Then ask one follow-up OR invite a retry, not both.
  Give a revised answer outline only after an attempt, or when requested.
- **Simulation:** stay in interviewer role, withhold coaching and scores until
  the end, and ask realistic follow-ups. Do not leak the intended answer in the
  question. If the user requests help, switch explicitly to coaching and label
  subsequent answers as assisted.
- Prefer one or two follow-ups per main question, unless the user wants a deep
  dive. Investigate unclear personal responsibility, decision rationale,
  alternatives, result measurement, or a discrepancy. Ask neutrally; missing
  evidence is not proof of dishonesty.
- Let the user skip, pause, change mode/language, or end early. A skipped topic
  is unassessed, not a zero. At the intended end include reverse-question
  practice where appropriate, then provide the assessment; do not prolong
  practice indefinitely. In simulation, answer reverse questions only from
  verified company facts or clearly labeled fictional scenario assumptions.

Keep initial answers distinct from retries and suggested rewrites. Never invent
metrics, employment history, motivations, employer feedback, or abilities.
Mark gaps in a proposed rewrite as `[要確認]`. Do not update the candidate
profile from a practice answer without separate confirmation. Do not claim to
observe voice, eye contact, body language, or speaking time from text alone.
Use approximate speaking-length guidance as an estimate, not a measurement.

## Close and preserve practice notes

Use the assessment reference for an evidence-backed final review, including
when the session ends early. Label it **AI mock interview assessment**, never
an employer verdict or pass probability. Offer a focused next exercise.

Unless the user chose conversation-only, use `apply_patch` to save notes in a
new, collision-checked `.job-search/interview/mock/<session-id>/` directory.
Generate a non-personal session ID; never derive paths from raw user text or
company names. Keep the record separate from real interview notes and all
immutable application artifacts. These Markdown notes are not database records.

- `session.md`: practice label, session ID, actual start date, mode, languages,
  target role/stage, optional verified application ID, source identifiers and
  versions when available, selected scope/rubric, and running/paused/completed
  state. Append numbered questions and the user's answers after each exchange;
  preserve wording, or explicitly label any summary. Distinguish follow-ups,
  skips, retries, assistant feedback, and fictional scenario facts.
- `review.md`: final assessment using the rubric. If revising a completed review,
  write a new numbered review instead of silently replacing the previous one.
- On resume, read the selected session first and continue from the last exchange.
  If multiple sessions could match, ask which. Never manufacture lost answers.
  If saving fails, report that notes were not saved; do not claim persistence.

Only private practice files may be written by this workflow. Do not invoke
`status`, `submit`, `job evaluate`, `draft save`, or direct database writes for
practice results. Do not create an application just to attach a simulation.
Do not edit `.job-search/objects/` or submitted materials. No employer is
contacted. The existing Web dashboard does not display these mock sessions or
scores; adding that integration requires a separate implementation request.
