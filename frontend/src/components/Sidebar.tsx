import { Link } from "react-router-dom";
import type { Session } from "../types";
import { Navigation } from "./Navigation";

export function Sidebar({ session }: { session: Session }) {
  return (
    <aside className="sidebar" aria-label="主导航">
      <Link className="brand" to="/">
        <span className="brand-mark">J</span>
        <span>AI Job Agent</span>
      </Link>
      <Navigation />
      <div className="sidebar-bottom">
        <div className="local-status">
          <span className="status-dot" />
          <div>
            <strong>本地优先</strong>
            <span>数据仅保存在本机</span>
          </div>
        </div>
        <span className="sidebar-version">
          工作区已连接 ·{" "}
          {session.draft_status_labels.working ? "可编辑" : "就绪"}
        </span>
      </div>
    </aside>
  );
}
