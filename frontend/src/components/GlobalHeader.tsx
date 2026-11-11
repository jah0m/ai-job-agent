import * as Tooltip from "@radix-ui/react-tooltip";
import { Languages } from "lucide-react";
import { LOCALES, type Locale, useI18n } from "../i18n";

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-switcher">
      <Languages aria-hidden="true" size={15} />
      <span className="sr-only">{t.shell.header.language}</span>
      <select
        aria-label={t.shell.header.language}
        onChange={(event) => setLocale(event.target.value as Locale)}
        value={locale}
      >
        {LOCALES.map((item) => (
          <option key={item.code} lang={item.intl} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GlobalHeader() {
  const { t } = useI18n();
  return (
    <header className="global-header">
      <div className="global-header-left">
        <span className="header-context">{t.shell.header.context}</span>
      </div>
      <div className="global-header-right">
        <LanguageSwitcher />
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="sync-indicator">
                <span className="status-dot" />
                {t.shell.header.synced}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip-content" sideOffset={6}>
                {t.shell.header.syncedTooltip}
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span className="header-avatar" aria-hidden="true">
          J
        </span>
      </div>
    </header>
  );
}
