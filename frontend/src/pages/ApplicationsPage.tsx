import { ArrowRight, GripVertical, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import {
  Button,
  EmptyState,
  PageIntro,
  Panel,
  StatusBadge,
  useToast,
} from "../components/Layout";
import { formatDate } from "../format";
import type {
  ApplicationListItem,
  ApplicationsResponse,
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
}: {
  item: ApplicationListItem;
  labels: Session["application_labels"];
}) {
  return (
    <article
      className="kanban-card"
      draggable={item.status !== "applied"}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
    >
      <div className="kanban-card-top">
        <GripVertical aria-hidden="true" className="drag-handle" size={16} />
        <StatusBadge
          label={labels[item.status] ?? item.status}
          tone={applicationTone(item.status)}
        />
      </div>
      <Link className="kanban-card-link" to={`/applications/${item.id}`}>
        <h3>{item.role}</h3>
        <p>{item.company}</p>
      </Link>
      <div className="kanban-card-footer">
        <time>{formatDate(item.updated_at)}</time>
        <ArrowRight aria-hidden="true" size={15} />
      </div>
    </article>
  );
}

export function ApplicationsPage({ session }: { session: Session }) {
  const { showToast } = useToast();
  const [data, setData] = useState<ApplicationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
        />
        <Panel>
          <EmptyState
            action={
              <Button
                onClick={() => window.location.assign("/")}
                variant="secondary"
              >
                去岗位
              </Button>
            }
            description="在岗位详情中点击“创建申请记录”，申请会进入这里。"
            title="尚无申请记录"
          />
        </Panel>
      </div>
    );

  return (
    <div className="applications-page">
      <PageIntro
        description={`${data.applications.length} 个申请 · “已投递”由投递记录自动进入`}
        title="申请"
      />
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
                <span>{column.manual ? "可手动移动" : "由投递记录进入"}</span>
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
                  label={session.application_labels[item.status] ?? item.status}
                  tone="neutral"
                />
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
