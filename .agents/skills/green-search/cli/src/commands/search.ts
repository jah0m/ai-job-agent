import {
  BASE_URL,
  htmlFetch,
  parseJobCards,
  resolveJobType,
  resolveArea,
  writeError,
  JOBTYPE_CODES,
  AREA_CODES,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number // accepted but unsupported — Green exposes no posting-age filter
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

interface BuildResult {
  url: string
  matchedJobType: string | null
}

/** Errors returned as a tagged result rather than thrown, so search.ts can pick the error code. */
type BuildOutcome =
  | { ok: true; value: BuildResult }
  | { ok: false; error: string; code: string }

export function buildUrl(opts: SearchOpts): BuildOutcome {
  if (!opts.query) {
    return { ok: false, error: "--query is required", code: "MISSING_REQUIRED" }
  }
  const jobType = resolveJobType(opts.query)
  if (!jobType) {
    const known = Object.keys(JOBTYPE_CODES).join(", ")
    return {
      ok: false,
      error: `No Green category mapped for query "${opts.query}". Green has no free-text search — known categories: ${known}`,
      code: "UNMAPPED_QUERY",
    }
  }

  const params = new URLSearchParams()
  if (opts.location) {
    const area = resolveArea(opts.location)
    if (!area) {
      const known = Object.keys(AREA_CODES).join(", ")
      return {
        ok: false,
        error: `No Green area mapped for location "${opts.location}". Known areas: ${known}, or "remote"`,
        code: "UNMAPPED_LOCATION",
      }
    }
    if (area.kind === "area") params.set("area_id", area.code)
    else params.set("job_feature_id", "10")
  }

  const page = String(Math.max(1, opts.page)).padStart(2, "0")
  const qs = params.toString()
  const url = `${BASE_URL}/jobtype-l/${jobType.code}/${page}${qs ? `?${qs}` : ""}`
  return { ok: true, value: { url, matchedJobType: jobType.matchedKey } }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    const salary = (c.salary || "—").slice(0, 16)
    return `${c.id.padEnd(13)} ${title} ${company} ${loc} ${salary}`
  })
  const header =
    "ID".padEnd(13) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(16) + " SALARY"
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
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.salary || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
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
