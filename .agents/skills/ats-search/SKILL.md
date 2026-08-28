---
name: ats-search
description: Search public company career pages hosted on HERP Careers or HRMOS and read a specific public ATS job posting. Use for HERP求人, HRMOS求人, company careers hosted at herp.careers or hrmos.co, or when the user supplies a public HERP/HRMOS career-page URL. Requires a company slug because these ATS platforms do not expose a single cross-company public index.
---

# HERP / HRMOS ATS Search

Search one company's public ATS page with the zero-dependency Bun CLI. This is read-only and never opens application endpoints.

```powershell
bun run .agents/skills/ats-search/cli/src/cli.ts search --provider herp --company stockmark --query "Python" --format table
bun run .agents/skills/ats-search/cli/src/cli.ts search --provider hrmos --company hrbrain --query "エンジニア" --format table
bun run .agents/skills/ats-search/cli/src/cli.ts detail "https://herp.careers/v1/stockmark/JoBJex6vB6Yn" --format plain
```

`search` requires `--provider herp|hrmos` and `--company <slug>`, fetches one public company listing, and filters locally. `detail` accepts only public job paths: HERP `/v1/<company>/<job>` or HRMOS `/pages/<company>/jobs/<job>`. Reject HERP `/apply`, `/ref`, or `?viaCareers=` URLs and do not bypass login or access unlisted links.

These ATS systems have no public global company index, so use them after identifying a target employer. Return source URLs; never submit an application unless the user separately and explicitly asks.
