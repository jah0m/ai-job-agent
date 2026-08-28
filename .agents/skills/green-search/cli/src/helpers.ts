// Data source: Green (green-japan.com), a Japan IT/Web-focused job board.
// No authentication required. Listing pages are legacy server-rendered HTML
// (parsed with chunked regex, matching the linkedin-search pattern); detail
// pages are a newer Next.js app that embeds the full job record as JSON in a
// <script id="__NEXT_DATA__"> tag, so detail parsing is a JSON field read,
// not HTML scraping.
//
// Green has no free-text keyword search endpoint that isn't robots.txt-disallowed
// (robots.txt blocks `/search?`). Instead, search works by composing category-code
// paths (`/jobtype-l/<code>`) with optional `area_id`/`job_feature_id` query params —
// see JOBTYPE_CODES / AREA_CODES below and resolveJobType/resolveArea in search.ts.

export const BASE_URL = "https://www.green-japan.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string // "<companyId>/<jobId>"
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  tags: string[]
}

export interface JobDetail extends JobCard {
  description: string | null
  minSalary: number | null
  maxSalary: number | null
  salaryDetail: string | null
  employmentType: string | null
  qualification: string | null
}

/**
 * Job-type keyword -> Green `/jobtype-l/<code>` category code. Green's taxonomy
 * has no dedicated "full-stack" category; full-stack queries map to backend
 * (190100), the closest general development category — documented in SKILL.md.
 * Sourced live from Green's own category nav and job_high <select> (2026-07-26).
 */
export const JOBTYPE_CODES: Record<string, string> = {
  backend: "190100",
  "backend engineer": "190100",
  "バックエンド": "190100",
  "バックエンドエンジニア": "190100",
  fullstack: "190100",
  "full stack": "190100",
  "full-stack": "190100",
  "フルスタック": "190100",
  "フルスタックエンジニア": "190100",
  frontend: "190101",
  "front-end": "190101",
  "フロントエンド": "190101",
  "フロントエンドエンジニア": "190101",
  mobile: "190102",
  "mobile app": "190102",
  "スマホアプリ": "190102",
  "スマートフォンアプリ": "190102",
  "system dev": "190110",
  "システム開発": "190110",
  embedded: "190120",
  "組み込み": "190120",
  infra: "190150",
  infrastructure: "190150",
  "インフラ": "190150",
  "インフラエンジニア": "190150",
  network: "190151",
  "ネットワーク": "190151",
  "ネットワークエンジニア": "190151",
  middleware: "190140",
  pm: "190130",
  "project manager": "190130",
  "プロジェクトマネージャー": "190130",
  "社内se": "190180",
  "internal se": "190180",
  "product manager": "190200",
  "プロダクトマネージャー": "190200",
  consultant: "190170",
  "itコンサル": "190170",
  "data scientist": "190210",
  "データサイエンティスト": "190210",
  data: "190210",
  qa: "190220",
  "qaエンジニア": "190220",
  "品質保証": "190220",
}

/**
 * Prefecture name -> Green `area_id` query-param value. Codes are standard
 * JIS prefecture numbers and were confirmed against Green's own area_id
 * <select> (2026-07-26). Not exhaustive — only major markets are pre-mapped.
 */
export const AREA_CODES: Record<string, string> = {
  tokyo: "13",
  "東京": "13",
  "東京都": "13",
  kanagawa: "14",
  "神奈川": "14",
  chiba: "12",
  "千葉": "12",
  saitama: "11",
  "埼玉": "11",
  osaka: "27",
  "大阪": "27",
  hyogo: "28",
  "兵庫": "28",
  kyoto: "26",
  "京都": "26",
  aichi: "23",
  nagoya: "23",
  "愛知": "23",
  "名古屋": "23",
  hokkaido: "1",
  "北海道": "1",
  fukuoka: "40",
  "福岡": "40",
}

/** Green's `job_feature_id` code for "フルリモート" (full remote). */
export const REMOTE_FEATURE_ID = "10"

const REMOTE_ALIASES = new Set(["remote", "リモート", "フルリモート", "full remote", "fullremote"])

function normalizeKey(s: string): string {
  return s.trim().toLowerCase()
}

/** Resolve a free-text query to a Green jobtype-l code, exact then substring match. */
export function resolveJobType(query: string): { code: string; matchedKey: string } | null {
  const norm = normalizeKey(query)
  if (JOBTYPE_CODES[norm]) return { code: JOBTYPE_CODES[norm], matchedKey: norm }
  if (JOBTYPE_CODES[query.trim()]) return { code: JOBTYPE_CODES[query.trim()], matchedKey: query.trim() }
  for (const [key, code] of Object.entries(JOBTYPE_CODES)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.length < 4) continue
    if (norm.includes(lowerKey) || lowerKey.includes(norm)) {
      return { code, matchedKey: key }
    }
  }
  return null
}

/** Resolve --location to either a Green area_id or the "remote" feature filter. */
export function resolveArea(
  location: string,
): { kind: "area"; code: string } | { kind: "remote" } | null {
  const norm = normalizeKey(location)
  if (REMOTE_ALIASES.has(norm)) return { kind: "remote" }
  if (AREA_CODES[norm]) return { kind: "area", code: AREA_CODES[norm] }
  if (AREA_CODES[location.trim()]) return { kind: "area", code: AREA_CODES[location.trim()] }
  for (const [key, code] of Object.entries(AREA_CODES)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.length < 4) continue
    if (norm.includes(lowerKey) || lowerKey.includes(norm)) {
      return { kind: "area", code }
    }
  }
  return null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function clean(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
}

/**
 * Parse the legacy server-rendered listing page into job cards. Cards are
 * wrapped in `<div class="card-info__wrapper js-card-info__wrapper">`; we
 * split on that marker and parse each chunk independently so one malformed
 * card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split('card-info__wrapper js-card-info__wrapper').slice(1)

  for (const chunk of chunks) {
    const hrefMatch = chunk.match(/href="(\/company\/(\d+)\/job\/(\d+))"/)
    if (!hrefMatch) continue
    const [, path, companyId, jobId] = hrefMatch
    const id = `${companyId}/${jobId}`

    const titleMatch = chunk.match(/class="card-info__heading-area__title"[^>]*>([\s\S]*?)<\/h3>/)
    if (!titleMatch) continue
    const title = clean(titleMatch[1])
    if (!title) continue

    const companyMatch = chunk.match(/class="card-info__detail-area__box__title"[^>]*>([\s\S]*?)<\/h3>/)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const dateMatch = chunk.match(/class="update"[^>]*>([^<]*)</)
    const date = dateMatch ? clean(dateMatch[1]).replace(/更新$/, "").trim() || null : null

    const locationMatch = chunk.match(/icon-site"><\/span>([^<]*)</)
    const location = locationMatch ? clean(locationMatch[1]) || null : null

    const salaryMatch = chunk.match(/icon-salary"><\/span>\s*([^<]*?)<br/)
    const salary = salaryMatch ? clean(salaryMatch[1]) || null : null

    const tagRe = /class="code-tag">([^<]*)<\/span>/g
    const tags: string[] = []
    let tm: RegExpExecArray | null
    while ((tm = tagRe.exec(chunk)) !== null) {
      tags.push(clean(tm[1]))
    }

    results.push({
      id,
      title,
      company,
      location,
      date,
      url: `${BASE_URL}${path}`,
      salary,
      tags,
    })
  }

  return results
}

interface GreenNextDataJobOffer {
  title?: string
  summary?: string
  abstract?: string
  detail?: string
  qualification?: string
  minSalary?: number
  maxSalary?: number
  salaryDetail?: string
  employmentStatusName?: string
  areas?: { id: number; name: string }[]
  tags?: { id: number; name: string }[]
  renewedAtTimestamp?: number
}

interface GreenNextDataClient {
  fullName?: string
}

/** Extract and parse the detail page's embedded __NEXT_DATA__ JSON payload. */
function extractNextData(html: string): { jobOffer: GreenNextDataJobOffer; client: GreenNextDataClient } | null {
  const idx = html.indexOf("__NEXT_DATA__")
  if (idx === -1) return null
  const startTag = html.indexOf(">", idx) + 1
  const endTag = html.indexOf("</script>", startTag)
  if (startTag <= 0 || endTag === -1) return null
  try {
    const parsed = JSON.parse(html.slice(startTag, endTag))
    const pageProps = parsed?.props?.pageProps
    if (!pageProps?.jobOffer) return null
    return { jobOffer: pageProps.jobOffer, client: pageProps.client ?? {} }
  } catch {
    return null
  }
}

/** Parse a single job detail page (Next.js, JSON-embedded — no HTML scraping needed). */
export function parseJobDetail(html: string, companyId: string, jobId: string): JobDetail | null {
  const data = extractNextData(html)
  if (!data) return null
  const { jobOffer, client } = data

  const descriptionParts = [jobOffer.summary, jobOffer.abstract, jobOffer.detail].filter(
    (s): s is string => !!s && s.trim().length > 0,
  )

  const areas = (jobOffer.areas ?? []).map((a) => a.name)
  const tags = (jobOffer.tags ?? []).map((t) => t.name)
  const date = jobOffer.renewedAtTimestamp
    ? new Date(jobOffer.renewedAtTimestamp * 1000).toISOString().slice(0, 10)
    : null

  return {
    id: `${companyId}/${jobId}`,
    title: jobOffer.title ?? "(untitled)",
    company: client.fullName ?? null,
    location: areas.length ? areas.join("，") : null,
    date,
    url: `${BASE_URL}/company/${companyId}/job/${jobId}`,
    salary:
      jobOffer.minSalary || jobOffer.maxSalary
        ? `${jobOffer.minSalary ?? "?"}万円〜${jobOffer.maxSalary ?? "?"}万円`
        : null,
    tags,
    description: descriptionParts.join("\n\n") || null,
    minSalary: jobOffer.minSalary ?? null,
    maxSalary: jobOffer.maxSalary ?? null,
    salaryDetail: jobOffer.salaryDetail ?? null,
    employmentType: jobOffer.employmentStatusName ?? null,
    qualification: jobOffer.qualification ?? null,
  }
}
