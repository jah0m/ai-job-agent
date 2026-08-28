import { BASE_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept "<companyId>/<jobId>", "<companyId>-<jobId>", or a full Green job URL. */
function normalizeId(input: string): { companyId: string; jobId: string } | null {
  const url = input.match(/\/company\/(\d+)\/job\/(\d+)/)
  if (url) return { companyId: url[1], jobId: url[2] }
  const pair = input.match(/^(\d+)[/-](\d+)$/)
  if (pair) return { companyId: pair[1], jobId: pair[2] }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ids = normalizeId(opts.id)
  if (!ids) {
    writeError(`Could not parse a company/job ID from "${opts.id}" (expected "<companyId>/<jobId>" or a Green job URL)`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE_URL}/company/${ids.companyId}/job/${ids.jobId}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, ids.companyId, ids.jobId)
    if (!job) {
      writeError("Could not parse job detail page (page structure may have changed)", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.tags.length ? `Tags: ${job.tags.join(", ")}` : "",
        "",
        job.description || "(no description)",
        job.qualification ? `\n--- Qualification ---\n${job.qualification}` : "",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
