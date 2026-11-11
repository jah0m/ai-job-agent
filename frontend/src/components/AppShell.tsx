import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import type { Session } from "../types";
import { GlobalHeader } from "./GlobalHeader";
import { MobileNavigation } from "./MobileNavigation";
import { Sidebar } from "./Sidebar";
import { ToastProvider } from "./ToastProvider";

export function AppShell({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <ToastProvider>
      <a className="skip-link" href="#main-content">
        {t.shell.skipToContent}
      </a>
      <div className="app-shell">
        <Sidebar session={session} />
        <MobileNavigation />
        <div className="main-shell">
          <GlobalHeader />
          <main className="page-content" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
