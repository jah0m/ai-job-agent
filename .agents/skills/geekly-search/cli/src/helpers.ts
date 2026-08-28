// Data source: Geekly (geekly.co.jp), a Japan IT-focused career agent / job board.
// No authentication required. Both listing and detail pages are server-rendered
// HTML, parsed with chunked regex (matching the linkedin-search pattern).
//
// Geekly has no free-text keyword search endpoint that isn't robots.txt-disallowed
// in combination (robots.txt disallows `/*&*&*` — any URL with 2+ ampersands, i.e.
// 3+ combined query filters). Search instead composes up to TWO CakePHP-style
// filter params: `data[Search][syo_id][<code>]=<code>` (job role / tech-stack /
// language) and `data[Search][tyu_id][<code>]=<code>` (prefecture, remote-work,
// and a handful of dedicated candidate tags like "フルスタックエンジニア候補").
// See SYO_CODES / TYU_CODES below and resolveJobType/resolveArea in search.ts.

export const BASE_URL = "https://www.geekly.co.jp"

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
  id: string
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
  requiredSkills: string | null
  salaryDetail: string | null
  holidays: string | null
  employmentType: string | null
}

/**
 * Job role / technology / language keyword -> Geekly `syo_id` code (param
 * `data[Search][syo_id][<code>]=<code>`). Sourced live from Geekly's own
 * category/skill nav (2026-07-26) — not exhaustive (Geekly has 150+ syo_id
 * values covering every language/framework it tracks).
 */
export const SYO_CODES: Record<string, string> = {
  // Role categories
  "web自社開発": "12",
  "web系se・pg（自社製品）": "12",
  webproduct: "12",
  "web受託": "13",
  "web系se・pg（si・受託）": "13",
  websi: "13",
  infra: "7",
  infrastructure: "7",
  "サーバーエンジニア": "7",
  server: "8",
  database: "4",
  "データベース": "4",
  network: "6",
  "ネットワークエンジニア": "6",
  "社内se": "10",
  "internal se": "10",
  pm: "14",
  "プロジェクトマネージャー": "14",
  qa: "28",
  "品質管理": "28",
  testing: "28",
  security: "21",
  "セキュリティ": "21",
  "機械学習": "22",
  "aiエンジニア": "22",
  ml: "22",
  // Languages
  java: "63",
  php: "67",
  python: "68",
  ruby: "69",
  typescript: "71",
  javascript: "183",
  go: "62",
  golang: "62",
  "c#": "57",
  "c++": "58",
  swift: "70",
  kotlin: "123",
  scala: "124",
  rust: "125",
  // Frameworks / frontend
  react: "86",
  "react.js": "86",
  vue: "148",
  "vue.js": "148",
  angular: "80",
  "node.js": "84",
  nodejs: "84",
  "next.js": "140",
  nextjs: "140",
  rails: "143",
  "ruby on rails": "143",
  laravel: "138",
  django: "134",
  flutter: "137",
  // Cloud / infra tooling
  aws: "89",
  azure: "90",
  gcp: "91",
  docker: "228",
  kubernetes: "229",
  terraform: "231",
  ansible: "226",
}

/**
 * Prefecture / remote-work / candidate-tag keyword -> Geekly `tyu_id` code
 * (param `data[Search][tyu_id][<code>]=<code>`). Sourced live (2026-07-26).
 */
export const TYU_CODES: Record<string, string> = {
  tokyo: "124",
  "東京": "124",
  "東京都": "124",
  kanagawa: "125",
  "神奈川": "125",
  chiba: "126",
  "千葉": "126",
  saitama: "127",
  "埼玉": "127",
  osaka: "128",
  "大阪": "128",
  hyogo: "129",
  "兵庫": "129",
  kyoto: "130",
  "京都": "130",
  shiga: "131",
  nara: "132",
  wakayama: "133",
  ibaraki: "217",
  gunma: "218",
  tochigi: "219",
  aichi: "220",
  nagoya: "220",
  "愛知": "220",
  "名古屋": "220",
  shizuoka: "221",
  gifu: "222",
  mie: "223",
  hokkaido: "224",
  "北海道": "224",
}

/** Geekly's dedicated full-stack-candidate tag, filed under tyu_id like a location. */
export const FULLSTACK_TYU_ID = "182"
/** Remote-work tyu_id codes: 144 = "リモートワーク可" (remote-ok), 254 = "フルリモート" (full remote). */
export const REMOTE_OK_TYU_ID = "144"
export const FULL_REMOTE_TYU_ID = "254"

const REMOTE_ALIASES = new Set(["remote", "リモート", "フルリモート", "full remote", "fullremote"])

function normalizeKey(s: string): string {
  return s.trim().toLowerCase()
}

export type JobTypeMatch =
  | { param: "syo_id"; code: string; matchedKey: string }
  | { param: "tyu_id"; code: string; matchedKey: string }

/**
 * Resolve --query to a Geekly filter. "fullstack"/"フルスタック" routes to the
 * dedicated tyu_id=182 candidate tag (Geekly has no syo_id for it); everything
 * else is matched against SYO_CODES, exact then substring.
 */
export function resolveJobType(query: string): JobTypeMatch | null {
  const norm = normalizeKey(query)
  const fullstackAliases = ["fullstack", "full stack", "full-stack", "フルスタック", "フルスタックエンジニア"]
  if (fullstackAliases.includes(norm)) {
    return { param: "tyu_id", code: FULLSTACK_TYU_ID, matchedKey: "フルスタックエンジニア候補" }
  }
  if (SYO_CODES[norm]) return { param: "syo_id", code: SYO_CODES[norm], matchedKey: norm }
  if (SYO_CODES[query.trim()]) return { param: "syo_id", code: SYO_CODES[query.trim()], matchedKey: query.trim() }
  // Substring fallback only for keys long enough to avoid false positives
  // (e.g. the 2-letter key "go" matching inside "category").
  for (const [key, code] of Object.entries(SYO_CODES)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.length < 4) continue
    if (norm.includes(lowerKey) || lowerKey.includes(norm)) {
      return { param: "syo_id", code, matchedKey: key }
    }
  }
  return null
}

/** Resolve --location to a Geekly tyu_id: a prefecture, or a remote-work variant. */
export function resolveArea(location: string): { code: string; matchedKey: string } | null {
  const norm = normalizeKey(location)
  if (REMOTE_ALIASES.has(norm)) {
    return norm === "フルリモート" ? { code: FULL_REMOTE_TYU_ID, matchedKey: "フルリモート" } : { code: REMOTE_OK_TYU_ID, matchedKey: "リモートワーク可" }
  }
  if (TYU_CODES[norm]) return { code: TYU_CODES[norm], matchedKey: norm }
  if (TYU_CODES[location.trim()]) return { code: TYU_CODES[location.trim()], matchedKey: location.trim() }
  for (const [key, code] of Object.entries(TYU_CODES)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey.length < 4) continue
    if (norm.includes(lowerKey) || lowerKey.includes(norm)) {
      return { code, matchedKey: key }
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
  return decodeHtmlEntities(text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim())
}

/**
 * Parse the listing page into job cards. Cards are `<section class="recruitment_item ">`
 * (note the trailing space before the closing quote); we split on that exact
 * marker and parse each chunk independently so one malformed card cannot break
 * the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split('class="recruitment_item "').slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/href="\/search\/detail\/(\d+)\/"/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/<h2>\s*<a href="\/search\/detail\/\d+\/">([\s\S]*?)<\/a>/)
    if (!titleMatch) continue
    const title = clean(titleMatch[1])
    if (!title) continue

    const companyMatch = chunk.match(/class="company_name">\s*<a[^>]*>([\s\S]*?)<\/a>/)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const salaryMatch = chunk.match(/head_tag">年\s*収<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/)
    const salary = salaryMatch ? clean(salaryMatch[1]).replace(/\s+/g, "") || null : null

    const locationMatch = chunk.match(/head_tag">勤務地<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/)
    const location = locationMatch ? clean(locationMatch[1]) || null : null

    const tagRe = /class="recruitment_head_tags">([\s\S]*?)<\/ul>/
    const tagBlock = chunk.match(tagRe)
    const tags: string[] = []
    if (tagBlock) {
      const spanRe = /<span>([^<]*)<\/span>/g
      let tm: RegExpExecArray | null
      while ((tm = spanRe.exec(tagBlock[1])) !== null) {
        tags.push(clean(tm[1]))
      }
    }

    results.push({
      id,
      title,
      company,
      location,
      date: null, // Geekly's listing cards do not surface a posting date
      url: `${BASE_URL}/search/detail/${id}/`,
      salary,
      tags,
    })
  }

  return results
}

/** Parse a single job detail page's `<dl class="recruit-main-job-description__requirements">` dt/dd pairs. */
function parseRequirementsDl(html: string): Record<string, string> {
  const dlMatch = html.match(/class="recruit-main-job-description__requirements">([\s\S]*?)<\/dl>/)
  const fields: Record<string, string> = {}
  if (!dlMatch) return fields
  const pairRe = /<dt>([^<]*)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g
  let m: RegExpExecArray | null
  while ((m = pairRe.exec(dlMatch[1])) !== null) {
    fields[clean(m[1])] = clean(m[2])
  }
  return fields
}

export function parseJobDetail(html: string, id: string): JobDetail | null {
  const titleMatch = html.match(/class="recruit-head-contents__heading">([\s\S]*?)<\/h1>/)
  if (!titleMatch) return null
  const title = clean(titleMatch[1])

  const companyMatch = html.match(/class="recruit-head-contents__company-name">([\s\S]*?)<\/a>/)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  const fields = parseRequirementsDl(html)

  return {
    id,
    title,
    company,
    location: fields["勤務地"] ?? null,
    date: null,
    url: `${BASE_URL}/search/detail/${id}/`,
    salary: fields["年収"] ?? null,
    tags: [],
    description: fields["仕事内容"] ?? null,
    requiredSkills: fields["必要なスキル"] ?? null,
    salaryDetail: fields["年収"] ?? null,
    holidays: fields["休日・休暇"] ?? null,
    employmentType: null,
  }
}
