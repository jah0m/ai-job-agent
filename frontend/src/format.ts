export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return value.slice(0, withTime ? 16 : 10).replace("T", " ");
  return new Intl.DateTimeFormat(
    "zh-CN",
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
  if (value === "pursue") return "推荐申请";
  if (value === "consider") return "可以考虑";
  if (value === "skip") return "暂缓申请";
  return "未分析";
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
  const labels: Record<string, string> = {
    rirekisho: "履歴书",
    shokumu_keirekisho: "职务经历书",
    employer_form: "公司表格",
    portfolio: "作品集",
    other: "其他",
  };
  return labels[value ?? ""] ?? value ?? "文件";
}

export function joinLines(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
