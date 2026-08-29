import { describe, expect, test } from "vitest";
import { runCLI } from "./helpers";

// All cases fail flag parsing before any network request, so this suite is network-free.

describe("Green CLI flag validation", () => {
  test("--page not-a-number is rejected", async () => {
    const result = await runCLI(["search", "--query", "backend", "--page", "not-a-number"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("--limit not-a-number is rejected", async () => {
    const result = await runCLI(["search", "--query", "backend", "--limit", "abc"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("--jobage not-a-number is rejected", async () => {
    const result = await runCLI(["search", "--query", "backend", "--jobage", "abc"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("--help prints usage and exits 0", async () => {
    const result = await runCLI(["search", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("green-cli");
  });
});
