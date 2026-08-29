#!/usr/bin/env tsx
// Self-contained CLI for searching IT jobs on Geekly (geekly.co.jp), a Japan
// IT-focused career agent / job board. No external CLI framework, so it runs
// through the repository's Node/tsx command without a separate runtime.
//
// Geekly has no keyword-search endpoint that isn't robots.txt-disallowed, so
// `search` maps --query to a job-role/technology category code instead — see
// helpers.ts.

import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `geekly-cli — search IT jobs on Geekly (geekly.co.jp, Japan)

USAGE
  npm run portal:geekly -- search --query "<role|tech>" [flags]
  npm run portal:geekly -- detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      REQUIRED. Geekly has no free-text search — this is matched
                          against a job-role/technology category table (e.g. "backend",
                          "python", "react", "フルスタック"). Unmapped queries fail with
                          the known list.
  --location, -l <text>   Prefecture (e.g. "Tokyo", "大阪") or "remote"/"フルリモート".
  --jobage <days>         Accepted but unsupported — Geekly exposes no posting-age filter.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  npm run portal:geekly -- search -q "python" -l "Tokyo" --format table
  npm run portal:geekly -- search -q "フルスタック" -l "remote" --format table
  npm run portal:geekly -- detail 722884 --format plain
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (flags.help || flags.h) {
    process.stdout.write(HELP)
    return 0
  }

  if (!cmd) {
    process.stdout.write(HELP)
    return 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
        return null
      }
      return val
    }

    if (flags.jobage !== undefined && parseIntFlag("jobage", flags.jobage) === null) return 1
    if (flags.page !== undefined && parseIntFlag("page", flags.page) === null) return 1
    if (flags.limit !== undefined && parseIntFlag("limit", flags.limit) === null) return 1

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

function isMainModule(): boolean {
  const entry = process.argv[1]
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write(
        JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
      )
      process.exit(1)
    })
}
