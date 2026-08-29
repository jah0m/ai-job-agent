---
name: ats-search
description: Search public company career pages hosted on HERP Careers or HRMOS and read a specific public ATS job posting. Use for HERP求人, HRMOS求人, company careers hosted at herp.careers or hrmos.co, or when the user supplies a public HERP/HRMOS career-page URL. Requires a company slug because these ATS platforms do not expose a single cross-company public index.
---

# HERP / HRMOS ATS Search

Use the bundled Node CLI as a narrow public-page retriever. It can
search one known company's listing page or fetch one public detail page. It is
read-only and never opens application endpoints.

```powershell
npm run portal:ats -- search --provider herp --company stockmark --query "Python" --format table
npm run portal:ats -- search --provider hrmos --company hrbrain --query "エンジニア" --format table
npm run portal:ats -- detail "https://herp.careers/v1/stockmark/JoBJex6vB6Yn" --format plain
```

`search` requires `--provider herp|hrmos` and `--company <slug>`, fetches one public company listing, and filters locally. `detail` accepts only public job paths: HERP `/v1/<company>/<job>` or HRMOS `/pages/<company>/jobs/<job>`. Reject HERP `/apply`, `/ref`, or `?viaCareers=` URLs and do not bypass login or access unlisted links.

These ATS systems have no public global company index, so use them after identifying a target employer. Return source URLs; never submit an application unless the user separately and explicitly asks.

The CLI's detail output is source evidence, not the final import schema. When a
page publishes schema.org `JobPosting.baseSalary` JSON-LD with
`unitText: YEAR`, the CLI also returns a structured `salary` evidence object
containing the annual bounds, currency, and source text. After fetching detail,
read the job-search ingest workflow, have AI map page facts into fields such as
`salary`, `salary_detail`, `requirements`, and `work_style` with evidence,
then call `job import` on that normalized record. Never assume that an absent
CLI field means the employer omitted the information.
