import { ArrowRight, Check, GripVertical, LoaderCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import {
  EmptyState,
  PageIntro,
  Panel,
  StatusBadge,
  useToast,
} from "../components/Layout";
import { formatDate, labelFor } from "../format";
import { useI18n } from "../i18n";
import { preparationState } from "../preparation";
import type {
  Application,
  ApplicationListItem,
  ApplicationsResponse,
  Draft,
  Session,
} from "../types";

function applicationTone(status: string): string {
  if (status === "applied" || status === "offer") return "success";
  if (status === "interviewing") return "info";
  if (status === "evaluating") return "warning";
  return "neutral";
}

function ApplicationCard({
  item,
  labels,
  selected,
  onSelect,
}: {
  item: ApplicationListItem;
  labels: Session["application_labels"];
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const m = t.applications;
  return (
    <article
      className={`kanban-card${selected ? " is-selected" : ""}`}
      draggable={item.status !== "applied"}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
    >
      <button
        aria-label={m.selectCard(item.company, item.role)}
        aria-pressed={selected}
        className="kanban-card-select"
        onClick={onSelect}
        type="button"
      >
        <div className="kanban-card-top">
          <GripVertical aria-hidden="true" className="drag-handle" size={16} />
          <StatusBadge
            label={labelFor(
              t.common.applicationStatus,
              item.status,
              labels[item.status],
            )}
            tone={applicationTone(item.status)}
          />
        </div>
        <div className="kanban-card-link">
          <h3>{item.role}</h3>
          <p>{item.company}</p>
          {item.next_action.title && !item.next_action.completed_at ? (
            <p className="kanban-next-action">
              {m.nextAction(item.next_action.title)}
              {item.next_action.due_date
                ? ` · ${item.next_action.due_date}`
                : ""}
            </p>
          ) : null}
        </div>
      </button>
      <div className="kanban-card-footer">
        <time>{formatDate(item.updated_at)}</time>
        <Link
          aria-label={m.viewDetails(item.role)}
          className="kanban-card-detail-link"
          to={`/applications/${item.id}`}
        >
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
    </article>
  );
}

type ApplicationDetailData = {
  application: Application;
  draft: Draft;
};

function CompletionState({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  const { t } = useI18n();
  return (
    <li
      className={`inspector-completion-item${complete ? " is-complete" : ""}`}
    >
      <span className="inspector-completion-icon" aria-hidden="true">
        {complete ? <Check size={12} /> : null}
      </span>
      <span>{label}</span>
      <strong>{complete ? t.applications.done : t.applications.todo}</strong>
    </li>
  );
}

function ApplicationInspector({
  item,
  detail,
  loading,
  labels,
  onClose,
}: {
  item: ApplicationListItem;
  detail: ApplicationDetailData | null;
  loading: boolean;
  labels: Session["application_labels"];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const m = t.applications;
  const preparation = detail
    ? preparationState(detail.application, detail.draft)
    : null;
  const hasDocuments = preparation?.contentReady ?? false;
  const hasDeliverables = preparation?.hasDeliverables ?? false;
  const hasPackage = preparation?.steps[2] ?? false;
  const hasSubmission = Boolean(detail?.application.submissions.length);
  const completedCount = [hasDocuments, hasDeliverables, hasPackage].filter(
    Boolean,
  ).length;

  return (
    <aside
      aria-label={m.inspectorLabel}
      className="application-inspector"
      aria-labelledby="application-inspector-title"
    >
      <div className="inspector-heading">
        <div>
          <span className="page-eyebrow">{m.inspectorEyebrow}</span>
          <h2 id="application-inspector-title">{m.inspectorTitle}</h2>
        </div>
        <button
          aria-label={m.closeInspector}
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-identity">
        <strong>{item.role}</strong>
        <span>{item.company}</span>
      </div>
      <div className="inspector-meta">
        <div>
          <span>{m.currentStage}</span>
          <StatusBadge
            label={labelFor(
              t.common.applicationStatus,
              item.status,
              labels[item.status],
            )}
            tone={applicationTone(item.status)}
          />
        </div>
        <div>
          <span>{m.lastUpdated}</span>
          <time>{formatDate(item.updated_at, true)}</time>
        </div>
      </div>
      <div className="inspector-progress" aria-live="polite">
        <div className="inspector-progress-heading">
          <span>{m.materialsProgress}</span>
          <strong>{loading ? m.loadingShort : `${completedCount} / 3`}</strong>
        </div>
        <div className="inspector-progress-track" aria-hidden="true">
          <span
            style={{ width: `${loading ? 0 : (completedCount / 3) * 100}%` }}
          />
        </div>
      </div>
      <ul className="inspector-completion-list" aria-label={m.readinessLabel}>
        <CompletionState label={m.sourceChecked} complete={hasDocuments} />
        <CompletionState
          label={m.deliverablesUploaded}
          complete={hasDeliverables}
        />
        <CompletionState label={m.currentPackage} complete={hasPackage} />
      </ul>
      <p className="inspector-note">{m.submission(hasSubmission)}</p>
      <Link
        className="button button-secondary inspector-detail-link"
        to={`/applications/${item.id}`}
      >
        {m.openDetail}
        <ArrowRight aria-hidden="true" size={15} />
      </Link>
      <p className="inspector-note">{m.inspectorNote}</p>
    </aside>
  );
}

export function ApplicationsPage({ session }: { session: Session }) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.applications;
  const [data, setData] = useState<ApplicationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  );
  const [selectedDetail, setSelectedDetail] =
    useState<ApplicationDetailData | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api.applications());
    } catch (error) {
      showToast({
        title: m.loadFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, m, t]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (!data.applications.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId === undefined) {
      setSelectedId(data.applications[0].id);
      return;
    }
    if (
      selectedId !== null &&
      !data.applications.some((item) => item.id === selectedId)
    ) {
      setSelectedId(data.applications[0].id);
    }
  }, [data, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setSelectedLoading(false);
      return;
    }
    let cancelled = false;
    setSelectedLoading(true);
    setSelectedDetail(null);
    void api
      .application(selectedId)
      .then((detail) => {
        if (!cancelled) setSelectedDetail(detail);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showToast({
            title: t.applications.statusLoadFailed,
            description:
              error instanceof Error
                ? error.message
                : t.common.pleaseRetryLater,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, showToast, t]);

  const move = async (id: string, status: string) => {
    const target = data?.columns.find((column) => column.status === status);
    if (!target?.manual) {
      showToast({ title: m.automaticStage });
      return;
    }
    try {
      await postUrlEncoded(`/applications/${encodeURIComponent(id)}/status`, {
        status,
        return_to: "/applications",
      });
      await load();
    } catch (error) {
      showToast({
        title: m.moveFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    }
  };

  if (loading && !data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.loading}</span>
      </div>
    );
  if (!data?.applications.length)
    return (
      <div className="applications-page">
        <PageIntro
          description={m.emptyIntro}
          title={m.title}
          actions={
            <Link className="button button-primary" to="/?status=saved">
              <ArrowRight aria-hidden="true" size={16} />
              {m.startFromSaved}
            </Link>
          }
        />
        <Panel>
          <EmptyState
            action={
              <Link className="button button-primary" to="/?status=saved">
                {m.startFromSaved}
              </Link>
            }
            description={m.emptyHint}
            title={m.emptyTitle}
          />
        </Panel>
      </div>
    );

  const selectedItem = selectedId
    ? data.applications.find((item) => item.id === selectedId)
    : undefined;

  return (
    <div className="applications-page">
      <PageIntro
        description={m.count(data.applications.length)}
        title={m.title}
        actions={
          <Link className="button button-primary" to="/?status=saved">
            <ArrowRight aria-hidden="true" size={16} />
            {m.startFromSaved}
          </Link>
        }
      />
      <div className="applications-layout">
        <div className="applications-board-column">
          <section className="kanban-board" aria-label={m.boardLabel}>
            {data.columns.map((column) => {
              const columnLabel = labelFor(
                t.common.applicationStatus,
                column.status,
                column.label,
              );
              return (
                <section
                  className={`kanban-column column-${column.status}`}
                  key={column.status}
                  aria-label={m.columnLabel(columnLabel)}
                  onDragOver={(event) =>
                    column.manual && event.preventDefault()
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/plain");
                    if (id) void move(id, column.status);
                  }}
                >
                  <header>
                    <div>
                      <h2>{columnLabel}</h2>
                      <span>{column.manual ? m.manual : m.automatic}</span>
                    </div>
                    <strong>{column.items.length}</strong>
                  </header>
                  <div className="kanban-stack">
                    {column.items.length ? (
                      column.items.map((item) => (
                        <ApplicationCard
                          item={item}
                          key={item.id}
                          labels={session.application_labels}
                          onSelect={() => setSelectedId(item.id)}
                          selected={selectedId === item.id}
                        />
                      ))
                    ) : (
                      <div className="kanban-empty">{m.noItems}</div>
                    )}
                  </div>
                </section>
              );
            })}
          </section>
          {data.archived.length ? (
            <Panel className="archived-panel">
              <div className="section-heading">
                <div>
                  <h2>{m.archivedTitle}</h2>
                  <p>{m.archivedHint}</p>
                </div>
                <strong>{m.archivedCount(data.archived.length)}</strong>
              </div>
              <div className="archived-list">
                {data.archived.map((item) => (
                  <Link
                    className="archived-row"
                    key={item.id}
                    to={`/applications/${item.id}`}
                  >
                    <span>
                      <strong>{item.role}</strong>
                      <small>{item.company}</small>
                    </span>
                    <StatusBadge
                      label={labelFor(
                        t.common.applicationStatus,
                        item.status,
                        session.application_labels[item.status],
                      )}
                      tone="neutral"
                    />
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
        {selectedItem ? (
          <ApplicationInspector
            detail={selectedDetail}
            item={selectedItem}
            labels={session.application_labels}
            loading={selectedLoading}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
