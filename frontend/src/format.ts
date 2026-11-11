import { getActiveLocale, intlLocale } from "./i18n/locale";
import { messages } from "./i18n/messages";

function activeMessages() {
  return messages[getActiveLocale()];
}

export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return value.slice(0, withTime ? 16 : 10).replace("T", " ");
  return new Intl.DateTimeFormat(
    intlLocale(getActiveLocale()),
    withTime
      ? {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }
      : { year: "numeric", month: "2-digit", day: "2-digit" },
  ).format(date);
}

export function formatBytes(value?: number): string {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function recommendationLabel(value?: string | null): string {
  const labels = activeMessages().common.recommendation;
  if (value === "pursue") return labels.pursue;
  if (value === "consider") return labels.consider;
  if (value === "skip") return labels.skip;
  return labels.none;
}

export function recommendationTone(value?: string | null): string {
  if (value === "pursue") return "success";
  if (value === "consider") return "info";
  if (value === "skip") return "warning";
  return "neutral";
}

export function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

export function filePurpose(value?: string): string {
  const { common } = activeMessages();
  return common.filePurpose[value ?? ""] ?? value ?? common.file;
}

/** Localized label for a status code, falling back to the server label. */
export function labelFor(
  labels: Record<string, string>,
  key: string | null | undefined,
  fallback?: string,
): string {
  return labels[key ?? ""] ?? fallback ?? key ?? "";
}

export function joinLines(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
