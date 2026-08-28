import {
  BASE_URL,
  htmlFetch,
  parseJobCards,
  resolveJobType,
  resolveArea,
  writeError,
  SYO_CODES,
  TYU_CODES,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number // accepted but unsupported — Geekly exposes no posting-age filter
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

type BuildOutcome = { ok: true; value: { url: string } } | { ok: false; error: string; code: string }

/**
 * Geekly's robots.txt disallows any URL with 2+ ampersands (`/*&*&*`), so at
 * most two `data[Search][...]` filters can be combined. --query and --location
 * each contribute at most one, so this is always within budget.
 */
export function buildUrl(opts: SearchOpts): BuildOutcome {
  if (!opts.query) {
    return { ok: false, error: "--query is required", code: "MISSING_REQUIRED" }
  }
  const jobType = resolveJobType(opts.query)
  if (!jobType) {
    const known = Object.keys(SYO_CODES).join(", ")
    return {
      ok: false,
      error: `No Geekly category mapped for query "${opts.query}". Geekly has no free-text search — known categories: ${known}`,
      code: "UNMAPPED_QUERY",
    }
  }

  const filters: { param: string; code: string }[] = [{ param: jobType.param, code: jobType.code }]

  if (opts.location) {
    const area = resolveArea(opts.location)
    if (!area) {
      const known = Object.keys(TYU_CODES).join(", ")
      return {
        ok: false,
        error: `No Geekly area mapped for location "${opts.location}". Known areas: ${known}, or "remote"/"フルリモート"`,
        code: "UNMAPPED_LOCATION",
      }
    }
    filters.push({ param: "tyu_id", code: area.code })
  }

  const qs = filters.map((f) => `data%5BSearch%5D%5B${f.param}%5D%5B${f.code}%5D=${f.code}`).join("&")
  const page = Math.max(1, opts.page)
  const url = `${BASE_URL}/search/joblist/page:${page}/?${qs}`
  return { ok: true, value: { url } }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const salary = c.salary || "—"
    return `${c.id.padEnd(9)} ${title} ${company} ${loc} ${salary}`
  })
  const header = "ID".padEnd(9) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(18) + " SALARY"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const built = buildUrl(opts)
  if (!built.ok) {
    writeError(built.error, built.code)
    return 1
  }
  try {
    const html = await htmlFetch(built.value.url)
    let cards = parseJobCards(html)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
