export type Locale = "zh" | "ja" | "en";

export const LOCALES: readonly {
  code: Locale;
  label: string;
  intl: string;
}[] = [
  { code: "zh", label: "简体中文", intl: "zh-CN" },
  { code: "ja", label: "日本語", intl: "ja-JP" },
  { code: "en", label: "English", intl: "en-US" },
];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "ai-job-agent.locale";

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "ja" || value === "en";
}

export function intlLocale(locale: Locale): string {
  return LOCALES.find((item) => item.code === locale)?.intl ?? "en-US";
}

/** Pick the first supported language from the browser's preference list. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

// formatDate and other plain helpers read the active locale from here; the
// provider updates it synchronously before its subtree renders.
let activeLocale: Locale = DEFAULT_LOCALE;

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}
