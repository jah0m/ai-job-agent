import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  detectLocale,
  getActiveLocale,
  intlLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
  setActiveLocale,
} from "./locale";
import { type Messages, messages } from "./messages";

export type { Locale } from "./locale";
export { LOCALES } from "./locale";
export type { Messages } from "./messages";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Messages;
};

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Messages for the active locale, for code that runs outside render (effects,
 * async callbacks) and must not re-run when the locale changes.
 */
export function currentMessages(): Messages {
  return messages[getActiveLocale()];
}

function initialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return detectLocale(
    typeof navigator === "undefined" ? [] : (navigator.languages ?? []),
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  setActiveLocale(locale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this page view.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = intlLocale(locale);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", messages[locale].shell.metaDescription);
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t: messages[locale] }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
