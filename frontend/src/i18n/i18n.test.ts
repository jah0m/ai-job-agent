import { afterEach, describe, expect, it } from "vitest";
import { formatDate, labelFor, recommendationLabel } from "../format";
import { buildJobAnalysisPrompt } from "../prompts";
import { detectLocale, isLocale, setActiveLocale } from "./locale";
import { messages } from "./messages";

function shape(value: unknown): unknown {
  if (typeof value === "function") return "function";
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, shape(item)]),
    );
  return typeof value;
}

afterEach(() => setActiveLocale("en"));

describe("locale detection", () => {
  it("picks the first supported browser language", () => {
    expect(detectLocale(["fr-FR", "ja-JP", "en-US"])).toBe("ja");
    expect(detectLocale(["zh-TW"])).toBe("zh");
    expect(detectLocale(["en-GB"])).toBe("en");
  });
  it("falls back to English for unsupported languages", () => {
    expect(detectLocale(["fr-FR", "de"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });
  it("validates stored values", () => {
    expect(isLocale("ja")).toBe(true);
    expect(isLocale("jp")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("message catalogs", () => {
  it("define the same keys in every locale", () => {
    expect(shape(messages.ja)).toEqual(shape(messages.zh));
    expect(shape(messages.en)).toEqual(shape(messages.zh));
  });
  it("cover every application status the server sends", () => {
    const statuses = [
      "draft",
      "evaluating",
      "ready",
      "applied",
      "interviewing",
      "offer",
      "rejected",
      "withdrawn",
      "closed",
    ];
    for (const locale of ["zh", "ja", "en"] as const) {
      for (const status of statuses)
        expect(messages[locale].common.applicationStatus[status]).toBeTruthy();
    }
  });
});

describe("locale-aware helpers", () => {
  it("translate labels for the active locale", () => {
    setActiveLocale("ja");
    expect(recommendationLabel("pursue")).toBe("応募推奨");
    setActiveLocale("en");
    expect(recommendationLabel(undefined)).toBe("Not analyzed");
  });
  it("fall back to the server label, then the code", () => {
    expect(labelFor({ a: "A" }, "a", "server")).toBe("A");
    expect(labelFor({}, "b", "server")).toBe("server");
    expect(labelFor({}, "c")).toBe("c");
  });
  it("build Codex prompts in the active language", () => {
    const job = { id: "job-1", title: "Engineer", company: "" };
    setActiveLocale("zh");
    expect(buildJobAnalysisPrompt(job)).toContain("未知公司");
    setActiveLocale("en");
    expect(buildJobAnalysisPrompt(job)).toContain("Unknown company");
  });
  it("format dates with the active locale", () => {
    setActiveLocale("en");
    const en = formatDate("2026-09-01T00:00:00");
    setActiveLocale("ja");
    const ja = formatDate("2026-09-01T00:00:00");
    expect(en).toContain("2026");
    expect(ja).toContain("2026");
    expect(en).not.toBe(ja);
  });
});
