# Green (green-japan.com) URL Reference

## robots.txt summary (checked 2026-07-26)

```
Disallow: /search?
Disallow: /api/v2
Disallow: /bridge/ /admin/ /mypage0* /registrations/ /favorites/ /messages/
          /job_applies/ /profiles/ /user_searches/ /browsing_history*
          /client/ /requests/  (+ /mobile/ equivalents)
Disallow: ~50 individually listed legacy /job/{id} and /company/{id} pages
          (a hardcoded list of old URLs, not a pattern — does not cover the
          /company/{cid}/job/{jid} URLs this CLI uses)
```

Category-browsing paths (`/jobtype-l/`, `/area/`, `/industry_h/`, `/detail-j/`)
and their query-param equivalents (`area_id`, `job_feature_id`) are **not**
disallowed. `GPTBot` is fully blocked; several other bots have `Crawl-delay`
directives but `User-agent: *` has none.

## Search: category-code browsing (no free-text search)

```
https://www.green-japan.com/jobtype-l/<jobTypeCode>/<page:02d>?area_id=<areaCode>&job_feature_id=<featureCode>
```

- `<jobTypeCode>` — required. See `JOBTYPE_CODES` in `cli/src/helpers.ts`.
- `<page>` — zero-padded 2-digit page number (`01`, `02`, ... `10`, `11`, ...). Omitting it 301-redirects to `01`.
- `area_id` — optional prefecture filter. See `AREA_CODES`. JIS prefecture numbers (confirmed live: 13=Tokyo, 27=Osaka, 23=Aichi, 40=Fukuoka, 14=Kanagawa, 12=Chiba, 11=Saitama, 28=Hyogo, 26=Kyoto, 1=Hokkaido).
- `job_feature_id=10` — optional "フルリモート" (full-remote) filter, sourced from the `job_feature` `<select>` on any listing page.
- `area_id` and `job_feature_id` compose together via `&` (confirmed live, both apply simultaneously). A third dimension (e.g. salary range) was not tested.
- An alternate hyphenated path form also works for single filters without pagination (`/jobtype-l/190100/area-13`, `/jobtype-l/190100/detail-j-10`) but does **not** compose with a page number in the same form (`/jobtype-l/190100/area-13/02` → 404) — the CLI uses the query-param form exclusively since it composes cleanly with pagination.

### Job-type codes (job_high `<select>`, sample — not exhaustive)

| Code | Japanese label | Notes |
|------|----------------|-------|
| 190100 | バックエンドエンジニア | Also used for `fullstack`/`フルスタック` — no dedicated full-stack category exists |
| 190101 | フロントエンドエンジニア | |
| 190102 | スマートフォンアプリエンジニア | |
| 190110 | システム開発（汎用系） | |
| 190120 | システム開発（制御・組み込み） | |
| 190130 | プロジェクトマネージャー（PM）・リーダー | |
| 190140 | パッケージソフト・ミドルウェア開発 | |
| 190150 | インフラエンジニア | |
| 190151 | ネットワークエンジニア | |
| 190160 | ネットワーク/サーバ監視・運用・保守・技術サポート | |
| 190170 | ITコンサルタント・プリセールス | |
| 190180 | 社内情報システムエンジニア（社内SE） | |
| 190190 | その他システム関連 | |
| 190200 | プロダクトマネージャー | |
| 190210 | データサイエンティスト | |
| 190220 | QAエンジニア・品質保証 | |

Non-engineering top-level categories also exist (160=クリエイティブ職, 110=企画・マーケティング, 100=営業, 230=経営・CxO, 120=経理・管理, 140=サービス職, 220=建築設計) but are out of scope for this skill's engineer focus.

## Detail: Next.js embedded JSON (no HTML scraping)

```
https://www.green-japan.com/company/<companyId>/job/<jobId>
```

Unlike listing pages (legacy server-rendered HTML), detail pages are a Next.js
app. The full job record is embedded as JSON in `<script id="__NEXT_DATA__">`
at `props.pageProps.jobOffer` (+ `props.pageProps.client` for company name).
`cli/src/helpers.ts`'s `parseJobDetail` reads this directly — confirmed live
2026-07-26 with job `4243/307860`. Key `jobOffer` fields used: `title`,
`summary`, `abstract`, `detail`, `qualification`, `minSalary`, `maxSalary`,
`salaryDetail`, `employmentStatusName`, `areas` (array of `{id,name}`), `tags`
(array of `{id,name}`), `renewedAtTimestamp` (unix seconds).

## Listing card HTML anchors (legacy page, for `parseJobCards`)

Each card is `<div class="card-info__wrapper js-card-info__wrapper">` wrapping
`<a class="js-search-result-box card-info " href="/company/<cid>/job/<jid>">`.
Within a card:

| Field | Anchor |
|-------|--------|
| Title | `<h3 class="card-info__heading-area__title">` |
| Company | `<h3 class="card-info__detail-area__box__title">` |
| Date | `<span class="update">YYYY/MM/DD 更新</span>` |
| Location | `<span class="icon-site"></span><location text>` |
| Salary | `<span class="icon-salary"></span><salary text><br />` |
| Tech tags | `<span class="code-tag"><tag></span>` (repeated) |

~25-36 cards per page depending on filters (confirmed live, varies by category size).
