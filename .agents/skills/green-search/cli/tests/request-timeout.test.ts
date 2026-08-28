import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch } from "../src/helpers";

// A stalled upstream connection (accepted socket, no response) would otherwise
// hang the CLI forever - fetch has no default timeout. Assert htmlFetch carries
// an AbortSignal timeout.
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("request timeout", () => {
  test("htmlFetch passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    await htmlFetch("https://example.invalid/mock-request");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("htmlFetch returns empty string on 404 instead of throwing", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await htmlFetch("https://example.invalid/mock-request")).toBe("");
  });
});
