import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import { groupNextActions, localDate } from "../nextActions";
import type { ApplicationListItem } from "../types";
import { Button, PageIntro, Panel, useToast } from "./Layout";

export function TodayActionsPage() {
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [today, setToday] = useState(localDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useToast();
  const load = useCallback(async () => {
    try {
      const data = await api.applications();
      setItems(data.applications);
      setError("");
      setToday(localDate());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请重试");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => setToday(localDate()), 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [load]);
  const complete = async (item: ApplicationListItem) => {
    setBusy(item.id);
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(item.id)}/next-action`,
        {
          operation: "complete",
          expected_revision: item.next_action.revision,
        },
      );
      await load();
      showToast({
        title: "待办已完成",
        description: "可在申请详情设置下一步或重新打开。",
        tone: "success",
      });
    } catch (reason) {
      showToast({
        title: "更新失败",
        description: reason instanceof Error ? reason.message : "请重试",
      });
      await load();
    } finally {
      setBusy(null);
    }
  };
  const { overdue, dueToday, upcoming, undated, unset } = groupNextActions(
    items,
    today,
  );
  const rows = (list: ApplicationListItem[]) => (
    <ul className="today-list">
      {list.map((item) => (
        <li key={item.id}>
          <div className="today-action-copy">
            <strong>{item.next_action.title}</strong>
            <Link to={`/applications/${encodeURIComponent(item.id)}`}>
              {item.company} · {item.role}
            </Link>
          </div>
          <span className="today-due">
            {item.next_action.due_date ?? "未设日期"}
          </span>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void complete(item)}
            aria-label={`完成待办：${item.next_action.title}`}
          >
            完成
          </Button>
          <Link
            className="button button-ghost"
            to={`/applications/${encodeURIComponent(item.id)}#next-action`}
          >
            编辑 / 延期
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="today-page">
      <PageIntro description="集中处理到期行动，再推进申请" title="今日待办" />
      <Panel className="today-panel">
        <div className="section-heading">
          <div>
            <span className="page-eyebrow">{today} · 本机日期</span>
            <h2>行动列表</h2>
            <p>逾期和今天到期的事项优先显示。</p>
          </div>
          <Button variant="ghost" onClick={() => void load()}>
            刷新待办
          </Button>
        </div>
        {loading ? (
          <p role="status">正在读取待办…</p>
        ) : error ? (
          <p role="alert">待办读取失败：{error}</p>
        ) : (
          <>
            {overdue.length ? (
              <section className="today-overdue">
                <h3>已逾期 · {overdue.length}</h3>
                {rows(overdue)}
              </section>
            ) : null}
            {dueToday.length ? (
              <section>
                <h3>今天到期 · {dueToday.length}</h3>
                {rows(dueToday)}
              </section>
            ) : null}
            {!overdue.length && !dueToday.length ? (
              <p className="today-empty">今天没有到期或逾期的待办。</p>
            ) : null}
            {upcoming.length ? (
              <details className="today-later">
                <summary>之后到期 · {upcoming.length}</summary>
                {rows(upcoming)}
              </details>
            ) : null}
            {undated.length ? (
              <details className="today-later">
                <summary>未设日期 · {undated.length}</summary>
                {rows(undated)}
              </details>
            ) : null}
            <p className="field-hint">
              {unset
                ? `${unset} 份进行中的申请尚未设置下一步，或上一项已完成。`
                : "在申请详情中管理下一步行动。"}{" "}
              <Link to="/applications">前往申请看板 →</Link>
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
