import type { ReactNode } from "react";
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
  return (
    <ToastProvider>
      <a className="skip-link" href="#main-content">
        跳到主要内容
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
