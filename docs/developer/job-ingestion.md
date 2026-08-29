# Job discovery and ingestion boundary

This document defines the end-to-end boundary for turning a public job page
into a durable discovered-job record. The portal retriever, AI mapper, schema
validator, and workspace database have separate responsibilities.

```text
public detail page
  -> portal CLI retrieves source evidence
  -> job evidence registers URL + snapshot + SHA-256
  -> AI maps supported page facts to schema v2
  -> job validate checks the complete record or batch
  -> job import repeats validation and writes atomically
  -> optional job evaluate stores candidate-specific conclusions
```

Search-card output is discovery data, not an import record. A selected job must
be fetched from its public detail page before normalization.

## 1. Retriever boundary

Portal CLIs are deterministic, read-only retrievers. They may:

- validate a public job URL;
- fetch a listing or detail page;
- preserve visible text and structured source data;
- expose directly published facts such as schema.org
  `JobPosting.baseSalary` JSON-LD;
- return the canonical source URL and provider identity.

They do not decide semantic meaning, evaluate candidate fit, invent missing
facts, open application/login/referral endpoints, or write to the Storage-v2 database.
Different portals publish different evidence, so retriever output is not
expected to contain identical fields.

Save a faithful detail response under `.job-search/operations/<operation-id>/`, then register it:

```powershell
python scripts/job_search.py job evidence `
  --portal hrmos `
  --url <public-detail-url> `
  --snapshot .job-search/operations/<operation-id>/hrmos-role-1.json `
  --retriever ats-search/1
```

`job evidence` canonicalizes the URL and returns source metadata including the
snapshot path and SHA-256. AI must copy that metadata into the normalized
record; it must not calculate or rewrite provenance itself.

## 2. AI mapping boundary

AI reads the complete detail-page evidence and produces one schema-v2 object.
It maps meaning rather than copying portal labels mechanically.

Rules:

- Only `schema_version`, `title`, `url`, and `source` are required.
- Omit an optional field when the page does not support it. Do not ask the user
  for a fact merely because the schema offers that field.
- Do not emit `null`, blank strings, guessed values, legacy aliases, or
  placeholder text.
- `description` is a concise AI-authored summary of the role's mission and core
  duties, not the fetched page body.
- `field_evidence` contains short, field-specific source excerpts. The complete
  page is staged for import and then stored in the immutable object store.
- Candidate-match conclusions belong to `job evaluate`, not the normalized
  source record.

Example:

```json
{
  "schema_version": 2,
  "external_id": "test-role-001",
  "title": "AIエンジニア",
  "company": "Example株式会社",
  "location": "東京都赤坂",
  "url": "https://jobs.example.invalid/test-role-001",
  "description": "AI機能の探索、試作、検証、実装を担う。",
  "salary": {
    "annual_minimum": 6000000,
    "annual_maximum": 9000000,
    "currency": "JPY",
    "source_text": "年収 600万円 〜 900万円"
  },
  "work_style": {
    "remote": "hybrid",
    "source_text": "勤務場所はオフィスもしくは自宅から選択可能"
  },
  "source": {
    "provider": "test",
    "detail_url": "https://jobs.example.invalid/test-role-001",
    "retrieved_at": "2026-08-29T01:12:22+09:00",
    "snapshot_path": "operations/<operation-id>/hrmos-role-1.json",
    "snapshot_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "retriever": "test-search/1"
  },
  "field_evidence": {
    "location": "東京都港区赤坂1丁目2−3 テストビル",
    "salary": "年収 600万円 〜 900万円",
    "work_style": "勤務場所はオフィスもしくは自宅から選択可能"
  }
}
```

## 3. Field normalization rules

### Location

`location` is a concise geographic label for dashboard display and filtering,
with a maximum length of 40 characters. For Japanese postings, prefer the
prefecture plus the useful municipality or neighborhood, for example
`東京都赤坂`.

Do not store postal codes, street/block numbers, building names, floors,
access directions, or office-versus-home conditions in `location`. Preserve a
useful exact-address excerpt in `field_evidence.location`; map remote and
attendance conditions to `work_style`.

### Salary

`salary` represents comparable annual compensation published by the source:

- `annual_minimum` and `annual_maximum` are non-negative integers;
- at least one annual bound is required when `salary` is present;
- the maximum cannot be lower than the minimum;
- `currency` is a three-letter uppercase code such as `JPY`;
- `source_text` preserves the concise published salary expression.

Structured `JobPosting.baseSalary` may be used when the source states
`unitText: YEAR`. Monthly/hourly values, bonuses, fixed overtime, equity,
examples, and caveats are not silently converted into annual bounds; preserve
them in `salary_detail` or field evidence. A single example is not a range, and
an open-ended bound must remain open-ended.

### Work style

`work_style.remote` accepts exactly:

- `onsite`
- `hybrid`
- `remote`
- `unknown`

`office_days_per_week`, when explicitly stated, is an integer from 1 through 5.
It must be omitted for `remote` and `unknown`. Do not infer attendance days from
generic phrases such as “hybrid work available.”

### Other optional fields

`company`, `posted_at`, `requirements`, `language_requirements`, `tags`, and
other optional fields are included only when the page supports them. Unknown,
ambiguous, or contradictory facts are omitted rather than completed from model
memory or another posting.

## 4. Validation and atomic import

Validate the AI output separately from retrieval:

```powershell
python scripts/job_search.py job validate `
  --portal hrmos `
  --file .job-search/operations/<operation-id>/normalized-hrmos-role-1.json

python scripts/job_search.py job import `
  --portal hrmos `
  --file .job-search/operations/<operation-id>/normalized-hrmos-role-1.json
```

Both commands enforce the packaged `schemas/job-result.schema.json`. They also
verify:

- provider and canonical detail-URL agreement;
- timezone-aware retrieval time;
- an operations- or cache-relative snapshot path;
- snapshot existence and SHA-256 integrity;
- salary-bound ordering;
- remote/office-day consistency;
- evidence references only fields that are present.

Unknown properties, invalid enums, malformed dates, blank strings, stale
hashes, and inconsistent cross-field values reject the record. A batch is
fully validated before its database transaction, so one invalid item cannot
cause a partial import. Re-importing the same portal identity updates the
existing job instead of creating a duplicate. Successful import consumes
staged JSON and snapshots only after commit; failures retain them.

## 5. Import is not evaluation

The normalized record describes what the employer published. Candidate-specific
strengths, gaps, compensation judgments, hard constraints, and recommendations
are stored separately with:

```powershell
python scripts/job_search.py job evaluate <job-id> --file <evaluation.json>
```

This separation keeps source facts stable when the candidate profile or
preferences change and lets the dashboard mark an evaluation stale using its
recorded input hashes.
