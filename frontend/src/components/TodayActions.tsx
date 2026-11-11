import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const m = t.workflow.today;
  const load = useCallback(async () => {
    try {
      const data = await api.applications();
      setItems(data.applications);
      setError("");
      setToday(localDate());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
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
        title: m.completed,
        description: m.completedHint,
        tone: "success",
      });
    } catch (reason) {
      showToast({
        title: m.updateFailed,
        description:
          reason instanceof Error ? reason.message : t.common.pleaseRetry,
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
            {item.next_action.due_date ?? m.noDate}
          </span>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void complete(item)}
            aria-label={m.completeLabel(item.next_action.title)}
          >
            {m.complete}
          </Button>
          <Link
            className="button button-ghost"
            to={`/applications/${encodeURIComponent(item.id)}#next-action`}
          >
            {m.editOrPostpone}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="today-page">
      <PageIntro description={m.description} title={m.title} />
      <Panel className="today-panel">
        <div className="section-heading">
          <div>
            <span className="page-eyebrow">
              {today} · {m.localDate}
            </span>
            <h2>{m.listHeading}</h2>
            <p>{m.listHint}</p>
          </div>
          <Button variant="ghost" onClick={() => void load()}>
            {m.refresh}
          </Button>
        </div>
        {loading ? (
          <p role="status">{m.loading}</p>
        ) : error ? (
          <p role="alert">{m.loadFailed(error)}</p>
        ) : (
          <>
            {overdue.length ? (
              <section className="today-overdue">
                <h3>
                  {m.overdue} · {overdue.length}
                </h3>
                {rows(overdue)}
              </section>
            ) : null}
            {dueToday.length ? (
              <section>
                <h3>
                  {m.dueToday} · {dueToday.length}
                </h3>
                {rows(dueToday)}
              </section>
            ) : null}
            {!overdue.length && !dueToday.length ? (
              <p className="today-empty">{m.none}</p>
            ) : null}
            {upcoming.length ? (
              <details className="today-later">
                <summary>
                  {m.upcoming} · {upcoming.length}
                </summary>
                {rows(upcoming)}
              </details>
            ) : null}
            {undated.length ? (
              <details className="today-later">
                <summary>
                  {m.undated} · {undated.length}
                </summary>
                {rows(undated)}
              </details>
            ) : null}
            <p className="field-hint">
              {unset ? m.unset(unset) : m.manageHint}{" "}
              <Link to="/applications">{m.toBoard}</Link>
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
