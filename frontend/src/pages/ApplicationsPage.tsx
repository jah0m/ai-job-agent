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
import { formatDate } from "../format";
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
  return (
    <article
      className={`kanban-card${selected ? " is-selected" : ""}`}
      draggable={item.status !== "applied"}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
    >
      <button
        aria-label={`${item.company} ${item.role}，选择以查看申请状态`}
        aria-pressed={selected}
        className="kanban-card-select"
        onClick={onSelect}
        type="button"
      >
        <div className="kanban-card-top">
          <GripVertical aria-hidden="true" className="drag-handle" size={16} />
          <StatusBadge
            label={labels[item.status] ?? item.status}
            tone={applicationTone(item.status)}
          />
        </div>
        <div className="kanban-card-link">
          <h3>{item.role}</h3>
          <p>{item.company}</p>
        </div>
      </button>
      <div className="kanban-card-footer">
        <time>{formatDate(item.updated_at)}</time>
        <Link
          aria-label={`查看 ${item.role} 详情`}
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
  return (
    <li
      className={`inspector-completion-item${complete ? " is-complete" : ""}`}
    >
      <span className="inspector-completion-icon" aria-hidden="true">
        {complete ? <Check size={12} /> : null}
      </span>
      <span>{label}</span>
      <strong>{complete ? "已完成" : "待完成"}</strong>
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
  const draftPaths = new Set(
    detail?.draft.files.map((file) => file.path) ?? [],
  );
  const hasDocuments =
    draftPaths.has("rirekisho.md") && draftPaths.has("shokumu-keirekisho.md");
  const hasDeliverables = Boolean(detail?.draft.deliverable_files.length);
  const hasPackage = Boolean(detail?.application.packages.length);
  const hasSubmission = Boolean(detail?.application.submissions.length);
  const completedCount = [
    hasDocuments,
    hasDeliverables,
    hasPackage,
    hasSubmission,
  ].filter(Boolean).length;

  return (
    <aside
      aria-label="申请状态侧栏"
      className="application-inspector"
      aria-labelledby="application-inspector-title"
    >
      <div className="inspector-heading">
        <div>
          <span className="page-eyebrow">申请状态</span>
          <h2 id="application-inspector-title">当前申请</h2>
        </div>
        <button
          aria-label="关闭申请状态侧栏"
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
          <span>当前阶段</span>
          <StatusBadge
            label={labels[item.status] ?? item.status}
            tone={applicationTone(item.status)}
          />
        </div>
        <div>
          <span>最后更新</span>
          <time>{formatDate(item.updated_at, true)}</time>
        </div>
      </div>
      <div className="inspector-progress" aria-live="polite">
        <div className="inspector-progress-heading">
          <span>材料完成度</span>
          <strong>{loading ? "读取中" : `${completedCount} / 4`}</strong>
        </div>
        <div className="inspector-progress-track" aria-hidden="true">
          <span style={{ width: `${loading ? 0 : completedCount * 25}%` }} />
        </div>
      </div>
      <ul className="inspector-completion-list" aria-label="申请准备状态">
        <CompletionState label="申请文书" complete={hasDocuments} />
        <CompletionState label="实际投递文件" complete={hasDeliverables} />
        <CompletionState label="材料包" complete={hasPackage} />
        <CompletionState label="投递记录" complete={hasSubmission} />
      </ul>
      <Link
        className="button button-secondary inspector-detail-link"
        to={`/applications/${item.id}`}
      >
        查看申请详情
        <ArrowRight aria-hidden="true" size={15} />
      </Link>
      <p className="inspector-note">
        状态信息仅供查看，具体操作请进入申请详情。
      </p>
    </aside>
  );
}

export function ApplicationsPage({ session }: { session: Session }) {
  const { showToast } = useToast();
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
        title: "申请加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);
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
            title: "申请状态加载失败",
            description: error instanceof Error ? error.message : "请稍后重试",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, showToast]);

  const move = async (id: string, status: string) => {
    const target = data?.columns.find((column) => column.status === status);
    if (!target?.manual) {
      showToast({ title: "这个阶段由投递记录自动进入" });
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
        title: "阶段更新失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    }
  };

  if (loading && !data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取申请记录…</span>
      </div>
    );
  if (!data?.applications.length)
    return (
      <div className="applications-page">
        <PageIntro
          description="从岗位详情创建申请后，会在这里集中管理阶段。"
          title="申请"
          actions={
            <Link className="button button-primary" to="/?status=saved">
              <ArrowRight aria-hidden="true" size={16} />
              从已保存岗位开始申请
            </Link>
          }
        />
        <Panel>
          <EmptyState
            action={
              <Link className="button button-primary" to="/?status=saved">
                从已保存岗位开始申请
              </Link>
            }
            description="在岗位详情中点击“创建申请记录”，申请会进入这里。"
            title="尚无申请记录"
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
        description={`${data.applications.length} 个申请 · “已投递”由投递记录自动进入`}
        title="申请"
        actions={
          <Link className="button button-primary" to="/?status=saved">
            <ArrowRight aria-hidden="true" size={16} />
            从已保存岗位开始申请
          </Link>
        }
      />
      <div className="applications-layout">
        <div className="applications-board-column">
          <section className="kanban-board" aria-label="申请阶段">
            {data.columns.map((column) => (
              <section
                className={`kanban-column column-${column.status}`}
                key={column.status}
                aria-label={`${column.label}申请`}
                onDragOver={(event) => column.manual && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain");
                  if (id) void move(id, column.status);
                }}
              >
                <header>
                  <div>
                    <h2>{column.label}</h2>
                    <span>
                      {column.manual ? "可手动移动" : "由投递记录进入"}
                    </span>
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
                    <div className="kanban-empty">暂无申请</div>
                  )}
                </div>
              </section>
            ))}
          </section>
          {data.archived.length ? (
            <Panel className="archived-panel">
              <div className="section-heading">
                <div>
                  <h2>已结束</h2>
                  <p>已拒绝、已撤回或已关闭的申请</p>
                </div>
                <strong>{data.archived.length} 个</strong>
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
                      label={
                        session.application_labels[item.status] ?? item.status
                      }
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
