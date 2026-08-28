import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against the real green-japan.com — per add-portal.md Step 4,
// a portal skill must never be registered without a real, passing fetch.
// Keep this file's request volume minimal (one search + one detail).

interface SearchResult {
  meta: { count: number; page: number };
  results: { id: string; title: string; company: string | null; url: string }[];
}

describe("Green live smoke test", () => {
  test(
    "search for backend engineer jobs in Tokyo returns real results",
    async () => {
      const result = await runCLI(["search", "-q", "backend", "-l", "Tokyo", "--limit", "5"]);
      const data = parseJSON<SearchResult>(result);

      expect(data.results.length).toBeGreaterThan(0);
      for (const job of data.results) {
        expect(job.title.length).toBeGreaterThan(0);
        expect(job.id).toMatch(/^\d+\/\d+$/);
        expect(job.url).toContain("green-japan.com");
      }
    },
    30000,
  );

  test(
    "detail for a real job returns a full description",
    async () => {
      const search = await runCLI(["search", "-q", "backend", "-l", "Tokyo", "--limit", "1"]);
      const { results } = parseJSON<SearchResult>(search);
      expect(results.length).toBeGreaterThan(0);

      const detail = await runCLI(["detail", results[0].id, "--format", "plain"]);
      expect(detail.exitCode).toBe(0);
      expect(detail.stdout.length).toBeGreaterThan(50);
      expect(detail.stdout).toContain(results[0].title);
    },
    30000,
  );
});
