import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

describe("Geekly CLI error contract", () => {
  test("search without a query fails with JSON on stderr, no network call", async () => {
    const result = await runCLI(["search"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: "--query is required",
      code: "MISSING_REQUIRED",
    });
  });

  test("search with an unmapped query fails with UNMAPPED_QUERY, no network call", async () => {
    const result = await runCLI(["search", "--query", "totally-not-a-category"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNMAPPED_QUERY");
    expect(error.error).toContain("totally-not-a-category");
  });

  test("search with an unmapped location fails with UNMAPPED_LOCATION, no network call", async () => {
    const result = await runCLI(["search", "--query", "python", "--location", "Narnia"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNMAPPED_LOCATION");
    expect(error.error).toContain("Narnia");
  });

  test("detail without an ID fails before making a request", async () => {
    const result = await runCLI(["detail"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: "detail requires an <id|url>",
      code: "NO_ID",
    });
  });

  test("detail with an unparseable ID fails before making a request", async () => {
    const result = await runCLI(["detail", "not-an-id"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("BAD_ID");
  });

  test("an invalid numeric flag fails before making a request", async () => {
    const result = await runCLI(["search", "--query", "python", "--page", "not-a-number"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("BAD_ARG");
  });

  test("an unknown command fails with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Unknown command "frobnicate"',
      code: "BAD_CMD",
    });
  });
});
