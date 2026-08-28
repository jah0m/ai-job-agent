# Geekly (geekly.co.jp) URL Reference

## robots.txt summary (checked 2026-07-26)

```
Disallow: /?direct_flg=
Disallow: /*?*direct_flg=
Disallow: *?jobid=*
Disallow: *?presco_sid=*
Disallow: /joblist/diagnosis/
Disallow: /assets/data/
Disallow: /joblistAjax/
Disallow: /read_company_name/
Disallow: *direction:
Disallow: */limit:*/page:*
Disallow: */page:*/limit:*
Disallow: /*&*&*
```

Key constraints for this CLI:
- `/*&*&*` — any URL with **2 or more ampersands** (3+ combined query params) is disallowed. This CLI never combines more than two `data[Search][...]` filters (one from `--query`, one from `--location`), so it stays within budget — see `buildUrl` in `cli/src/commands/search.ts`.
- `*/limit:*/page:*` / `/page:*/limit:*` — a `limit:` and `page:` segment together in the same path is disallowed. This CLI's pagination uses `page:<n>/` alone and never sets `limit:`, so it is unaffected.
- `*?jobid=*` — a specific query-string job-detail pattern is disallowed; this CLI uses the clean path form `/search/detail/<id>/` instead, which is not covered by this rule.
- `/joblistAjax/` — the AJAX endpoint backing dynamic filtering in the browser is disallowed; this CLI never calls it — the initial server-rendered `/search/joblist/` page already contains full card data.

## Search

```
https://www.geekly.co.jp/search/joblist/page:<n>/?data[Search][<param1>][<code1>]=<code1>&data[Search][<param2>][<code2>]=<code2>
```

(URL-encoded: `data%5BSearch%5D%5B<param>%5D%5B<code>%5D=<code>`)

- `<n>` — 1-indexed page number. `page:1/` works explicitly (confirmed live); omitting the segment entirely (`/search/joblist/?...`) also returns page 1.
- Filter params are CakePHP-style array fields: `syo_id` (job role or specific technology/language) and `tyu_id` (prefecture, remote-work variant, or a small number of dedicated candidate tags). Multiple `tyu_id` entries can combine in the same query (e.g. a candidate tag + a prefecture) — confirmed live with `tyu_id[182]` (full-stack candidate) + `tyu_id[124]` (Tokyo) together, 200 OK.
- Confirmed live 2026-07-26: `/search/joblist/?data[Search][syo_id][12]=12` (50 results), `/search/joblist/page:2/?data[Search][syo_id][12]=12` (50 results, different jobs), `/search/joblist/?data[Search][tyu_id][182]=182` (50 results — full-stack candidate tag alone).

### syo_id — job role & technology codes (sample; Geekly has 150+ total)

| Code | Label | Code | Label |
|------|-------|------|-------|
| 12 | Web系SE・PG（自社製品） | 63 | Java |
| 13 | Web系SE・PG（SI・受託） | 67 | PHP |
| 14 | プロジェクトマネージャー（Web系） | 68 | Python |
| 7 | サーバーエンジニア（SI・受託） | 69 | Ruby |
| 8 | サーバーエンジニア（自社製品） | 71 | TypeScript |
| 4 | データベースエンジニア | 62 | Go |
| 5 | ネットワーク保守運用・監視 | 86 | React.js/React Native |
| 6 | ネットワークエンジニア | 84 | Node.js |
| 9/10/11 | 社内SE（IT戦略・企画／開発／ネットワーク） | 89/90/91 | AWS / MS Azure / GCP |
| 21 | セキュリティエンジニア | 228/229 | Docker / Kubernetes |
| 22 | 機械学習・AIエンジニア | 148 | Vue.js |
| 28 | テスティング、ローカライズ、品質管理エンジニア | 143 | Ruby on Rails |

Full list discoverable live via the accordion category nav at
`https://www.geekly.co.jp/search/engineer/` — each `<li><a href="/search/joblist/?data[Search][syo_id][N]=N">Label</a></li>` is one code.

### tyu_id — prefecture, remote-work, and candidate-tag codes (sample)

| Code | Label |
|------|-------|
| 124 | 東京都 |
| 125 | 神奈川県 |
| 128 | 大阪府 |
| 220 | 愛知県 |
| 224 | 北海道 |
| 144 | リモートワーク可 (remote-OK, includes hybrid) |
| 254 | フルリモート (full-remote only) |
| 182 | フルスタックエンジニア候補 (full-stack engineer candidate) — a dedicated tag, not a syo_id |

## Detail

```
https://www.geekly.co.jp/search/detail/<id>/
```

Plain server-rendered HTML (no embedded JSON, unlike Green). Confirmed live
2026-07-26 with job `722884`. Key anchors:

| Field | Anchor |
|-------|--------|
| Title | `<h1 class="recruit-head-contents__heading">` |
| Company | `<a class="recruit-head-contents__company-name">` |
| Everything else | `<dl class="recruit-main-job-description__requirements">` — a flat sequence of `<dt ...>label</dt><dd ...>value</dd>` pairs. Observed labels: 仕事内容 (job content), 必要なスキル (required skills), 勤務地 (location), 保険 (insurance), 諸手当 (allowances), 休日・休暇 (holidays), 年収 (salary), 業種 (industry), 設立 (founded), 従業員数 (employees), 資本金 (capital), 所在地 (company address) |

## Listing card HTML anchors (for `parseJobCards`)

Each card is `<section class="recruitment_item ">` (note the trailing space
before the closing quote — this exact string is the chunk-split marker).
Within a card:

| Field | Anchor |
|-------|--------|
| ID + URL | `<h2><a href="/search/detail/<id>/">` |
| Title | Same `<a>` element's text |
| Company | `<div class="company_name"><a>` |
| Feature tags | `<ul class="recruitment_head_tags"><li><span>` (repeated) |
| Salary | Observed variants include `<dt class="last-child">年収</dt><dd ...>` and `<dt class="head_tag">年　収</dt><dd class="content_text">`; detail parsing normalizes the label whitespace. |
| Location | `<dt class="head_tag">勤務地</dt><dd class="content_text">` |
| Posting date | Not present on listing cards — `date` is always `null` in `search` results |

50 cards per page (confirmed live across multiple filter combinations).
