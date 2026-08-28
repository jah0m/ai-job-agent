import {
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import {
  Button,
  EmptyState,
  PageIntro,
  Panel,
  StatusBadge,
  useToast,
} from "../components/Layout";
import { formatDate, recommendationLabel, recommendationTone } from "../format";
import {
  AI_PROMPTS,
  buildJobAnalysisPrompt,
  buildJobRefreshPrompt,
} from "../prompts";
import type { Job, JobDetail, Labels, Session } from "../types";

const JOB_STATUS_TABS = [
  { key: "application_active", label: "申请中" },
  { key: "saved", label: "收藏" },
  { key: "new", label: "新发现" },
  { key: "", label: "全部" },
  { key: "skipped", label: "跳过" },
  { key: "application_closed", label: "已关闭" },
] as const;
const JOB_SEARCH_DEBOUNCE_MS = 300;

function jobStatusTone(value: string): string {
  return value === "saved"
    ? "info"
    : value === "applied"
      ? "success"
      : value === "skipped"
        ? "neutral"
        : "warning";
}

function TableRating({ value }: { value?: number | null }) {
  const score = value ?? 0;
  return (
    <div
      aria-label={score ? `岗位评分 ${score} 星` : "岗位未评分"}
      className="table-rating"
      role="img"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          aria-hidden="true"
          fill={star <= score ? "currentColor" : "none"}
          key={star}
          size={12}
        />
      ))}
    </div>
  );
}

function workStyleSummary(
  remote?: Job["remote"],
  officeDays?: number | null,
): string {
  const remoteLabels = {
    onsite: "到岗办公",
    hybrid: "混合办公",
    remote: "远程办公",
    unknown: "办公方式待确认",
  } as const;
  const remoteLabel = remote ? remoteLabels[remote] : "";
  const officeDaysLabel = officeDays ? `每周到岗 ${officeDays} 天` : "";
  return [remoteLabel, officeDaysLabel].filter(Boolean).join(" · ");
}

function jobWorkStyle(job: Job): string {
  return workStyleSummary(job.remote, job.office_days_per_week) || "未公开";
}

function SelectArrow() {
  return <ChevronDown aria-hidden="true" className="select-arrow" size={16} />;
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="filter-select">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
      <SelectArrow />
    </label>
  );
}

function JobsTable({
  jobs,
  selected,
  labels,
  onSelect,
}: {
  jobs: Job[];
  selected: string;
  labels: Labels;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="jobs-table">
        <colgroup>
          <col className="job-col-title" />
          <col className="job-col-salary" />
          <col className="job-col-recommendation" />
          <col className="job-col-rating" />
          <col className="job-col-status" />
          <col className="job-col-location" />
          <col className="job-col-portal" />
          <col className="job-col-posted" />
        </colgroup>
        <thead>
          <tr>
            <th>职位 / 公司</th>
            <th>薪资</th>
            <th>AI 推荐</th>
            <th>评分</th>
            <th>状态</th>
            <th>地点</th>
            <th>平台</th>
            <th>发布日期</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr
              className={selected === job.id ? "is-selected" : ""}
              key={job.id}
              onClick={() => onSelect(job.id)}
            >
              <td>
                <button
                  className="table-title-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(job.id);
                  }}
                  title={job.title}
                  type="button"
                >
                  <strong>{job.title}</strong>
                  <span>{job.company || "未知公司"}</span>
                </button>
              </td>
              <td className="salary-cell">
                <span className="truncate-cell" title={job.salary || "未公开"}>
                  {job.salary || "未公开"}
                </span>
              </td>
              <td>
                <StatusBadge
                  label={recommendationLabel(job.evaluation?.recommendation)}
                  tone={recommendationTone(job.evaluation?.recommendation)}
                />
              </td>
              <td>
                <TableRating value={job.rating} />
              </td>
              <td>
                <StatusBadge
                  label={labels[job.status] ?? job.status}
                  tone={jobStatusTone(job.status)}
                />
              </td>
              <td className="muted-cell">
                <div
                  className="job-location-cell"
                  title={`${job.location || "地点未公开"} / ${jobWorkStyle(job)}`}
                >
                  <strong>{job.location || "地点未公开"}</strong>
                  <span>{jobWorkStyle(job)}</span>
                </div>
              </td>
              <td className="muted-cell">{job.portal}</td>
              <td className="muted-cell">{formatDate(job.posted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Analysis({ analysis }: { analysis: JobDetail["match_analysis"] }) {
  if (!analysis)
    return (
      <div className="analysis-empty">
        <strong>尚未进行 AI 匹配分析</strong>
        <p>请在 Codex 中要求分析这个职位；分析结果保存后会显示在这里。</p>
      </div>
    );
  const groups = [
    ["匹配经验", analysis.strengths, ""],
    ["可能不满足的要求", analysis.gaps.disqualifying, "is-critical"],
    ["可补足的差距", analysis.gaps.learnable, "is-gap"],
    ["需要确认", analysis.gaps.unclear, "is-question"],
  ] as const;
  return (
    <>
      <div className="analysis-summary-row">
        <StatusBadge
          label={recommendationLabel(analysis.recommendation)}
          tone={recommendationTone(analysis.recommendation)}
        />
        <span>
          置信度：
          {analysis.confidence === "high"
            ? "高"
            : analysis.confidence === "medium"
              ? "中"
              : "低"}
        </span>
      </div>
      <p className="analysis-summary">{analysis.summary}</p>
      {analysis.stale ? (
        <div className="inline-alert alert-warning">
          <strong>分析可能已过期</strong>
          <ul>
            {analysis.stale_reasons?.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {groups.map(([title, items, className]) =>
        items.length ? (
          <div className={`analysis-group ${className}`} key={title}>
            <strong>{title}</strong>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {analysis.hard_constraints.reasons.length ? (
        <div className="analysis-group">
          <strong>
            硬性条件：
            {analysis.hard_constraints.result === "pass"
              ? "符合"
              : analysis.hard_constraints.result === "fail"
                ? "不符合"
                : "尚不明确"}
          </strong>
          <ul>
            {analysis.hard_constraints.reasons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.questions.length ? (
        <div className="analysis-group is-question">
          <strong>下一步确认问题</strong>
          <ul>
            {analysis.questions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.source_limitations ? (
        <p className="field-hint">资料限制：{analysis.source_limitations}</p>
      ) : null}
    </>
  );
}

function preventBackgroundScroll(event: React.WheelEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest(".drawer-body")) {
    return;
  }
  event.preventDefault();
}

const DRAWER_ANIMATION_MS = 220;

function workStyleLabel(workStyle: JobDetail["work_style"]): string {
  if (!workStyle) return "";
  return workStyleSummary(workStyle.remote, workStyle.office_days_per_week);
}

function JobDrawer({
  job,
  session,
  isClosing,
  onClose,
  onRefresh,
}: {
  job: JobDetail;
  session: Session;
  isClosing: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState(job.status);
  const [rating, setRating] = useState(job.rating ? String(job.rating) : "");
  const [notes, setNotes] = useState(job.notes ?? "");
  const [statusSaving, setStatusSaving] = useState(false);
  const [reviewSaveState, setReviewSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const [creating, setCreating] = useState(false);
  const [analysisPromptCopied, setAnalysisPromptCopied] = useState(false);
  const [refreshPromptCopied, setRefreshPromptCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const refreshCopyResetTimerRef = useRef<number | null>(null);
  const reviewRevisionRef = useRef(0);
  const isStatusLocked = status === "applied" || Boolean(job.application);
  const analysisPrompt = buildJobAnalysisPrompt(job);
  const refreshPrompt = buildJobRefreshPrompt(job);

  useEffect(() => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    setAnalysisPromptCopied(false);
    if (refreshCopyResetTimerRef.current !== null) {
      window.clearTimeout(refreshCopyResetTimerRef.current);
      refreshCopyResetTimerRef.current = null;
    }
    setRefreshPromptCopied(false);
    reviewRevisionRef.current += 1;
    setReviewSaveState("idle");
    setStatus(job.status);
    setRating(job.rating ? String(job.rating) : "");
    setNotes(job.notes ?? "");
  }, [job]);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      if (refreshCopyResetTimerRef.current !== null) {
        window.clearTimeout(refreshCopyResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (reviewSaveState !== "dirty") return;
    const revision = reviewRevisionRef.current;
    const timer = window.setTimeout(async () => {
      setReviewSaveState("saving");
      try {
        await postUrlEncoded(`/jobs/${encodeURIComponent(job.id)}/review`, {
          rating,
          notes,
        });
        if (reviewRevisionRef.current === revision) {
          setReviewSaveState("saved");
        }
      } catch (error) {
        if (reviewRevisionRef.current === revision) {
          setReviewSaveState("error");
          showToast({
            title: "自动保存失败",
            description: error instanceof Error ? error.message : "请稍后重试",
          });
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [job.id, notes, rating, reviewSaveState, showToast]);

  const changeRating = (value: string) => {
    reviewRevisionRef.current += 1;
    setRating(value);
    setReviewSaveState("dirty");
  };

  const changeNotes = (value: string) => {
    reviewRevisionRef.current += 1;
    setNotes(value);
    setReviewSaveState("dirty");
  };

  const copyAnalysisPrompt = async () => {
    try {
      await navigator.clipboard.writeText(analysisPrompt);
      setAnalysisPromptCopied(true);
      showToast({
        title: "Prompt 已复制",
        description: "请粘贴到 Codex 中开始分析。",
        tone: "success",
      });
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setAnalysisPromptCopied(false);
        copyResetTimerRef.current = null;
      }, 2200);
    } catch {
      showToast({ title: "复制失败", description: "请检查浏览器剪贴板权限。" });
    }
  };

  const copyRefreshPrompt = async () => {
    try {
      await navigator.clipboard.writeText(refreshPrompt);
      setRefreshPromptCopied(true);
      showToast({
        title: "更新 Prompt 已复制",
        description: "请粘贴到 Codex 中重新获取并更新这个岗位。",
        tone: "success",
      });
      if (refreshCopyResetTimerRef.current !== null) {
        window.clearTimeout(refreshCopyResetTimerRef.current);
      }
      refreshCopyResetTimerRef.current = window.setTimeout(() => {
        setRefreshPromptCopied(false);
        refreshCopyResetTimerRef.current = null;
      }, 2200);
    } catch {
      showToast({ title: "复制失败", description: "请检查浏览器剪贴板权限。" });
    }
  };

  const changeStatus = async (value: string) => {
    if (isStatusLocked || value === status) return;
    setStatus(value);
    setStatusSaving(true);
    try {
      await postUrlEncoded(`/jobs/${encodeURIComponent(job.id)}/status`, {
        status: value,
      });
      await onRefresh();
    } catch (error) {
      setStatus(job.status);
      showToast({
        title: "更新失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setStatusSaving(false);
    }
  };

  const createApplication = async () => {
    setCreating(true);
    try {
      const response = await postUrlEncoded(
        `/jobs/${encodeURIComponent(job.id)}/application`,
        {},
      );
      const url = new URL(response.url);
      navigate(url.pathname);
    } catch (error) {
      showToast({
        title: "创建失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside
      aria-label="职位详情"
      className={`job-drawer${isClosing ? " is-closing" : ""}`}
      onWheel={preventBackgroundScroll}
    >
      <div className="drawer-header">
        <div>
          <span className="drawer-kicker">职位详情</span>
          <h2>{job.title}</h2>
          <div className="drawer-source-actions">
            <a href={job.url} rel="noreferrer" target="_blank">
              {job.company || "未知公司"}
              <ExternalLink size={14} />
            </a>
            <button
              className="drawer-refresh-button"
              onClick={() => void copyRefreshPrompt()}
              type="button"
            >
              <RefreshCw size={13} />
              {refreshPromptCopied ? "已复制" : "重新获取岗位信息"}
            </button>
          </div>
        </div>
        <button
          aria-label="关闭详情"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <X size={19} />
        </button>
      </div>
      <div className="drawer-meta">
        <span>{job.location || "地点未公开"}</span>
        <span>{job.portal}</span>
        {job.posted_at ? <span>发布于 {formatDate(job.posted_at)}</span> : null}
        <span>更新于 {formatDate(job.last_seen_at)}</span>
      </div>
      <div className="drawer-body">
        {job.salary || job.work_style || job.salary_detail ? (
          <section className="drawer-section">
            <h3>岗位信息</h3>
            <dl className="job-facts-grid">
              {job.salary ? (
                <div>
                  <dt>薪资范围</dt>
                  <dd>{job.salary}</dd>
                </div>
              ) : null}
              {job.work_style ? (
                <div>
                  <dt>工作方式</dt>
                  <dd>{workStyleLabel(job.work_style)}</dd>
                </div>
              ) : null}
            </dl>
            {job.salary_detail ? (
              <div className="job-detail-block">
                <strong>薪资说明</strong>
                <p>{job.salary_detail}</p>
              </div>
            ) : null}
            {job.work_style?.source_text ? (
              <div className="job-detail-block">
                <strong>办公安排</strong>
                <p>{job.work_style.source_text}</p>
              </div>
            ) : null}
          </section>
        ) : null}
        {job.description ? (
          <section className="drawer-section">
            <h3>职位描述</h3>
            <p className="drawer-description">{job.description}</p>
            {job.tags.length ? (
              <div className="tag-list">
                {job.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {job.requirements?.must?.length ||
        job.requirements?.nice_to_have?.length ||
        job.language_requirements?.length ? (
          <section className="drawer-section">
            <h3>任职要求</h3>
            {job.requirements?.must?.length ? (
              <div className="job-requirement-group">
                <strong>必须条件</strong>
                <ul>
                  {job.requirements.must.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.requirements?.nice_to_have?.length ? (
              <div className="job-requirement-group">
                <strong>加分条件</strong>
                <ul>
                  {job.requirements.nice_to_have.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.language_requirements?.length ? (
              <div className="job-requirement-group">
                <strong>语言要求</strong>
                <ul>
                  {job.language_requirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
        <section className="drawer-section">
          <div className="section-label-row">
            <h3>AI 匹配分析</h3>
            <div className="analysis-heading-actions">
              {job.match_analysis ? (
                <Check className="success-icon" size={17} />
              ) : null}
              <button
                className="analysis-copy-button"
                onClick={() => void copyAnalysisPrompt()}
                type="button"
              >
                <Sparkles size={14} />
                {analysisPromptCopied ? "已复制" : "AI 分析"}
              </button>
            </div>
          </div>
          <div className="analysis-card">
            <Analysis analysis={job.match_analysis} />
          </div>
        </section>
        <section className="drawer-section">
          <div className="section-label-row">
            <h3>岗位操作</h3>
            {statusSaving ? <LoaderCircle className="spin" size={16} /> : null}
          </div>
          <div
            aria-describedby={
              isStatusLocked ? "applied-job-actions-note" : undefined
            }
            className="drawer-job-actions"
          >
            <button
              aria-pressed={status === "saved"}
              className={`drawer-job-action drawer-job-action-favorite${
                status === "saved" ? " is-active" : ""
              }`}
              disabled={statusSaving || isStatusLocked}
              onClick={() => void changeStatus("saved")}
              type="button"
            >
              <Star
                fill={status === "saved" ? "currentColor" : "none"}
                size={17}
              />
              收藏
            </button>
            <button
              aria-pressed={status === "skipped"}
              className={`drawer-job-action drawer-job-action-skip${
                status === "skipped" ? " is-active" : ""
              }`}
              disabled={statusSaving || isStatusLocked}
              onClick={() => void changeStatus("skipped")}
              type="button"
            >
              <X size={18} />
              跳过
            </button>
          </div>
          {isStatusLocked ? (
            <p
              className="drawer-job-actions-note"
              id="applied-job-actions-note"
            >
              已建立申请，不能再收藏或跳过。
            </p>
          ) : null}
        </section>
        <section className="drawer-section">
          <div className="section-label-row">
            <h3>评分与备注</h3>
            <span
              aria-live="polite"
              className={`review-save-status is-${reviewSaveState}`}
            >
              {reviewSaveState === "dirty" ? "等待保存…" : null}
              {reviewSaveState === "saving" ? (
                <>
                  <LoaderCircle className="spin" size={13} /> 保存中…
                </>
              ) : null}
              {reviewSaveState === "saved" ? (
                <>
                  <Check size={13} /> 已自动保存
                </>
              ) : null}
              {reviewSaveState === "error" ? "保存失败" : null}
            </span>
          </div>
          <div className="stack-form">
            <fieldset className="rating-field">
              <legend>岗位评分</legend>
              <div className="rating-stars">
                {[1, 2, 3, 4, 5].map((score) => {
                  const selectedScore = Number(rating || 0);
                  const isSelected = score <= selectedScore;
                  return (
                    <button
                      aria-label={`${score} 星`}
                      aria-pressed={rating === String(score)}
                      className={`rating-star${isSelected ? " is-selected" : ""}`}
                      key={score}
                      onClick={() =>
                        changeRating(
                          rating === String(score) ? "" : String(score),
                        )
                      }
                      type="button"
                    >
                      <Star
                        fill={isSelected ? "currentColor" : "none"}
                        size={23}
                      />
                    </button>
                  );
                })}
                <span aria-live="polite" className="rating-value">
                  {rating ? `${rating} 星` : "未评分"}
                </span>
              </div>
            </fieldset>
            <label className="field-label">
              <span>个人备注</span>
              <textarea
                maxLength={4000}
                onChange={(event) => changeNotes(event.target.value)}
                placeholder="记录亮点、疑问或下一步…"
                rows={4}
                value={notes}
              />
            </label>
          </div>
        </section>
        <section className="drawer-section application-callout">
          <h3>申请记录</h3>
          {job.application ? (
            <>
              <p>
                申请阶段：
                <StatusBadge
                  label={
                    session.application_labels[job.application.status] ??
                    job.application.status
                  }
                  tone="info"
                />
              </p>
              <Button
                onClick={() => navigate(`/applications/${job.application?.id}`)}
                variant="secondary"
              >
                查看申请
              </Button>
            </>
          ) : (
            <>
              <p>
                还没有申请记录。创建后可以在申请Kanban准备履歴書、职务经历书和最终
                PDF / DOCX。
              </p>
              <Button disabled={creating} onClick={createApplication}>
                {creating ? <LoaderCircle className="spin" size={15} /> : null}
                创建申请记录
              </Button>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}

function AnimatedJobDrawer({
  job,
  session,
  onClose,
  onRefresh,
}: {
  job?: JobDetail | null;
  session: Session;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [renderedJob, setRenderedJob] = useState<JobDetail | null>(job ?? null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (job) {
      setRenderedJob(job);
      setIsClosing(false);
      return;
    }
    if (!renderedJob) return;

    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setRenderedJob(null);
      setIsClosing(false);
    }, DRAWER_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [job, renderedJob]);

  if (!renderedJob) return null;

  return (
    <JobDrawer
      isClosing={isClosing}
      job={renderedJob}
      onClose={onClose}
      onRefresh={onRefresh}
      session={session}
    />
  );
}

export function DashboardPage({ session }: { session: Session }) {
  const [params, setParams] = useSearchParams();
  const { showToast } = useToast();
  const [data, setData] = useState<import("../types").JobsResponse | null>(
    null,
  );
  const pageScrollPositionRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchPromptCopied, setSearchPromptCopied] = useState(false);
  const searchCopyResetTimerRef = useRef<number | null>(null);
  const q = params.get("q") ?? "";
  const [searchInput, setSearchInput] = useState(q);
  const portal = params.get("portal") ?? "";
  const status = params.get("status") ?? "";
  const recommendation = params.get("recommendation") ?? "";
  const rating = params.get("rating") ?? "";
  const selected = params.get("selected") ?? "";
  const hasActiveFilters = Boolean(
    q || searchInput || portal || status || recommendation || rating,
  );

  useLayoutEffect(() => {
    const savedScrollPosition = pageScrollPositionRef.current;
    if (savedScrollPosition === null || data?.selected_job?.id !== selected) {
      return;
    }

    window.scrollTo(0, savedScrollPosition);
    pageScrollPositionRef.current = null;
  }, [data?.selected_job?.id, selected]);

  const query = useMemo(() => {
    const values = new URLSearchParams();
    if (q) values.set("q", q);
    if (portal) values.set("portal", portal);
    if (status) values.set("status", status);
    if (recommendation) values.set("recommendation", recommendation);
    if (rating) values.set("rating", rating);
    if (selected) values.set("selected", selected);
    const search = values.toString();
    return search ? `?${search}` : "";
  }, [portal, q, rating, recommendation, selected, status]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.jobs(query));
    } catch (error) {
      showToast({
        title: "岗位加载失败",
        description: error instanceof Error ? error.message : "请检查本地服务",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      if (searchCopyResetTimerRef.current !== null) {
        window.clearTimeout(searchCopyResetTimerRef.current);
      }
    },
    [],
  );

  const copySearchPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPTS.jobSearch);
      setSearchPromptCopied(true);
      showToast({
        title: "Prompt 已复制",
        description: "请粘贴到 Codex 中开始搜索。",
        tone: "success",
      });
      if (searchCopyResetTimerRef.current !== null) {
        window.clearTimeout(searchCopyResetTimerRef.current);
      }
      searchCopyResetTimerRef.current = window.setTimeout(() => {
        setSearchPromptCopied(false);
        searchCopyResetTimerRef.current = null;
      }, 2200);
    } catch {
      showToast({ title: "复制失败", description: "请检查浏览器剪贴板权限。" });
    }
  };

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(updates))
        value ? next.set(key, value) : next.delete(key);
      setParams(next);
    },
    [params, setParams],
  );

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    if (searchInput === q) return;

    const timer = window.setTimeout(() => {
      updateParams({ q: searchInput });
    }, JOB_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [q, searchInput, updateParams]);

  const selectJob = (id: string) => {
    if (id === selected) return;
    pageScrollPositionRef.current = window.scrollY;
    updateParams({ selected: id });
  };
  const closeDrawer = useCallback(
    () => updateParams({ selected: "" }),
    [updateParams],
  );

  useEffect(() => {
    if (!selected) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".job-drawer, .jobs-table tbody tr")) return;
      closeDrawer();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [closeDrawer, selected]);

  if (loading && !data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取本机岗位…</span>
      </div>
    );
  if (!data)
    return (
      <EmptyState
        title="暂时无法读取岗位"
        description="请确认本地 AI Job Agent 服务正在运行。"
        action={<Button onClick={() => void load()}>重试</Button>}
      />
    );

  return (
    <div className={`dashboard-page${data.selected_job ? " has-drawer" : ""}`}>
      <PageIntro
        description={`${data.total} 个已保存岗位`}
        title="岗位"
        actions={
          <>
            <Button onClick={() => void copySearchPrompt()}>
              <Sparkles size={16} />
              {searchPromptCopied ? "已复制" : "AI 搜索岗位"}
            </Button>
            <Button onClick={() => void load()} variant="secondary">
              <RefreshCw className={refreshing ? "spin" : ""} size={16} />
              刷新岗位
            </Button>
          </>
        }
      />
      <Panel className="jobs-panel">
        <div className="jobs-import-note">
          <Info aria-hidden="true" size={16} />
          <p>
            <strong>添加岗位：</strong>
            把公开的职位详情页 URL 发给 Codex，或让 Codex
            按求职偏好搜索；整理后的岗位会出现在这里。
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search-box">
            <Search size={18} />
            <span className="sr-only">搜索职位</span>
            <input
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索职位、公司或技术"
              value={searchInput}
            />
          </label>
          <FilterSelect
            label="平台"
            onChange={(value) => updateParams({ portal: value })}
            value={portal}
          >
            <option value="">全部平台</option>
            {data.portals.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="AI 推荐"
            onChange={(value) => updateParams({ recommendation: value })}
            value={recommendation}
          >
            <option value="">全部推荐</option>
            <option value="pursue">推荐申请</option>
            <option value="consider">可以考虑</option>
            <option value="skip">暂缓申请</option>
            <option value="unanalyzed">未分析</option>
          </FilterSelect>
          <FilterSelect
            label="岗位评分"
            onChange={(value) => updateParams({ rating: value })}
            value={rating}
          >
            <option value="">全部评分</option>
            <option value="4">4 星以上</option>
            <option value="3">3 星以上</option>
            <option value="unrated">未评分</option>
          </FilterSelect>
          <Button
            className="filter-reset-button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setSearchInput("");
              updateParams({
                q: "",
                portal: "",
                status: "",
                recommendation: "",
                rating: "",
              });
            }}
            variant="ghost"
          >
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
        <div className="status-tabs" role="tablist">
          {JOB_STATUS_TABS.map(({ key, label }) => (
            <button
              className={status === key ? "is-active" : ""}
              key={key}
              onClick={() => updateParams({ status: key })}
              type="button"
            >
              {label}{" "}
              <span>
                {key
                  ? (data.counts[key] ?? 0)
                  : Object.values(data.counts).reduce(
                      (total, count) => total + count,
                      0,
                    )}
              </span>
            </button>
          ))}
        </div>
        {data.jobs.length ? (
          <JobsTable
            jobs={data.jobs}
            labels={session.status_labels}
            onSelect={selectJob}
            selected={selected}
          />
        ) : (
          <EmptyState
            title={data.total ? "没有符合条件的岗位" : "尚未保存岗位"}
            description={
              data.total
                ? "调整搜索词或筛选条件后再试。"
                : "把公开职位 URL 发给 Codex 导入，或让 Codex 搜索岗位。"
            }
          />
        )}
      </Panel>
      <AnimatedJobDrawer
        job={selected ? data.selected_job : null}
        onClose={closeDrawer}
        onRefresh={load}
        session={session}
      />
    </div>
  );
}
