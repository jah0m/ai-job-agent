import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import type { Session } from "../types";
import { Navigation } from "./Navigation";

export function Sidebar({ session }: { session: Session }) {
  const { t } = useI18n();
  return (
    <aside className="sidebar" aria-label={t.shell.nav.label}>
      <Link className="brand" to="/">
        <span className="brand-mark">J</span>
        <span>AI Job Agent</span>
      </Link>
      <Navigation />
      <div className="sidebar-bottom">
        <div className="local-status">
          <span className="status-dot" />
          <div>
            <strong>{t.shell.localFirst}</strong>
            <span>{t.shell.localOnly}</span>
          </div>
        </div>
        <span className="sidebar-version">
          {t.shell.workspaceConnected} ·{" "}
          {session.draft_status_labels.working
            ? t.shell.editable
            : t.shell.ready}
        </span>
      </div>
    </aside>
  );
}
