import {
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
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
import { AiPromptButton } from "../components/AiPromptButton";
import {
  Button,
  EmptyState,
  PageIntro,
  Panel,
  StatusBadge,
  useToast,
} from "../components/Layout";
import {
  formatDate,
  labelFor,
  recommendationLabel,
  recommendationTone,
} from "../format";
import { type Messages, useI18n } from "../i18n";
import {
  aiPrompts,
  buildJobAnalysisPrompt,
  buildJobRefreshPrompt,
} from "../prompts";
import type { Job, JobDetail, Labels, Session } from "../types";

type DashboardMessages = Messages["dashboard"];

const JOB_STATUS_TABS = [
  { key: "application_active", tab: "application_active" },
  { key: "saved", tab: "saved" },
  { key: "new", tab: "new" },
  { key: "", tab: "all" },
  { key: "skipped", tab: "skipped" },
  { key: "application_closed", tab: "application_closed" },
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
  const { t } = useI18n();
  const score = value ?? 0;
  return (
    <div
      aria-label={score ? t.dashboard.ratingLabel(score) : t.dashboard.unrated}
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
  m: DashboardMessages,
  remote?: Job["remote"],
  officeDays?: number | null,
): string {
  const remoteLabel = remote ? m.remote[remote] : "";
  const officeDaysLabel = officeDays ? m.officeDays(officeDays) : "";
  return [remoteLabel, officeDaysLabel].filter(Boolean).join(" · ");
}

function jobWorkStyle(t: Messages, job: Job): string {
  return (
    workStyleSummary(t.dashboard, job.remote, job.office_days_per_week) ||
    t.common.notDisclosed
  );
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
  const { t } = useI18n();
  const c = t.dashboard.columns;
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
            <th>{c.title}</th>
            <th>{c.salary}</th>
            <th>{c.recommendation}</th>
            <th>{c.rating}</th>
            <th>{c.status}</th>
            <th>{c.location}</th>
            <th>{c.portal}</th>
            <th>{c.posted}</th>
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
                  <span>{job.company || t.common.unknownCompany}</span>
                </button>
              </td>
              <td className="salary-cell">
                <span
                  className="truncate-cell"
                  title={job.salary || t.common.notDisclosed}
                >
                  {job.salary || t.common.notDisclosed}
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
                  label={labelFor(
                    t.common.jobStatus,
                    job.status,
                    labels[job.status],
                  )}
                  tone={jobStatusTone(job.status)}
                />
              </td>
              <td className="muted-cell">
                <div
                  className="job-location-cell"
                  title={`${job.location || t.dashboard.locationUnknown} / ${jobWorkStyle(t, job)}`}
                >
                  <strong>{job.location || t.dashboard.locationUnknown}</strong>
                  <span>{jobWorkStyle(t, job)}</span>
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
  const { t } = useI18n();
  const m = t.dashboard.analysis;
  if (!analysis)
    return (
      <div className="analysis-empty">
        <strong>{m.emptyTitle}</strong>
        <p>{m.emptyHint}</p>
      </div>
    );
  const groups = [
    [m.strengths, analysis.strengths, ""],
    [m.disqualifying, analysis.gaps.disqualifying, "is-critical"],
    [m.learnable, analysis.gaps.learnable, "is-gap"],
    [m.unclear, analysis.gaps.unclear, "is-question"],
  ] as const;
  return (
    <>
      <div className="analysis-summary-row">
        <StatusBadge
          label={recommendationLabel(analysis.recommendation)}
          tone={recommendationTone(analysis.recommendation)}
        />
        <span>
          {m.confidence}
          {analysis.confidence === "high"
            ? m.confidenceHigh
            : analysis.confidence === "medium"
              ? m.confidenceMedium
              : m.confidenceLow}
        </span>
      </div>
      <p className="analysis-summary">{analysis.summary}</p>
      {analysis.stale ? (
        <div className="inline-alert alert-warning">
          <strong>{m.stale}</strong>
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
            {m.hardConstraints}
            {analysis.hard_constraints.result === "pass"
              ? m.pass
              : analysis.hard_constraints.result === "fail"
                ? m.fail
                : m.undetermined}
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
          <strong>{m.questions}</strong>
          <ul>
            {analysis.questions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.source_limitations ? (
        <p className="field-hint">
          {m.limitations(analysis.source_limitations)}
        </p>
      ) : null}
    </>
  );
}

function preventBackgroundScroll(event: React.WheelEvent<HTMLElement>) {
  if (
    event.target instanceof Element &&
    event.target.closest(".drawer-body, .dialog-content")
  ) {
    return;
  }
  event.preventDefault();
}

const DRAWER_ANIMATION_MS = 220;

function workStyleLabel(
  m: DashboardMessages,
  workStyle: JobDetail["work_style"],
): string {
  if (!workStyle) return "";
  return workStyleSummary(m, workStyle.remote, workStyle.office_days_per_week);
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
  const { t } = useI18n();
  const m = t.dashboard;
  const d = m.drawer;
  const navigate = useNavigate();
  const [status, setStatus] = useState(job.status);
  const [rating, setRating] = useState(job.rating ? String(job.rating) : "");
  const [notes, setNotes] = useState(job.notes ?? "");
  const [statusSaving, setStatusSaving] = useState(false);
  const [reviewSaveState, setReviewSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const [creating, setCreating] = useState(false);
  const reviewRevisionRef = useRef(0);
  const isStatusLocked = status === "applied" || Boolean(job.application);
  const analysisPrompt = buildJobAnalysisPrompt(job);
  const refreshPrompt = buildJobRefreshPrompt(job);

  useEffect(() => {
    reviewRevisionRef.current += 1;
    setReviewSaveState("idle");
    setStatus(job.status);
    setRating(job.rating ? String(job.rating) : "");
    setNotes(job.notes ?? "");
  }, [job]);

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
            title: m.autosaveFailed,
            description:
              error instanceof Error
                ? error.message
                : t.common.pleaseRetryLater,
          });
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [job.id, notes, rating, reviewSaveState, showToast, m, t]);

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
        title: m.updateFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
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
        title: m.createFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside
      aria-label={d.label}
      className={`job-drawer${isClosing ? " is-closing" : ""}`}
      onWheel={preventBackgroundScroll}
    >
      <div className="drawer-header">
        <div>
          <span className="drawer-kicker">{d.label}</span>
          <h2>{job.title}</h2>
          <div className="drawer-source-actions">
            <a href={job.url} rel="noreferrer" target="_blank">
              {job.company || t.common.unknownCompany}
              <ExternalLink size={14} />
            </a>
            <AiPromptButton
              className="drawer-refresh-button"
              label={d.copyRefresh}
              prompt={refreshPrompt}
              successDescription={d.refreshHint}
              onCheck={onRefresh}
            />
          </div>
        </div>
        <button
          aria-label={d.close}
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <X size={19} />
        </button>
      </div>
      <div className="drawer-meta">
        <span>{job.location || m.locationUnknown}</span>
        <span>{job.portal}</span>
        {job.posted_at ? (
          <span>{d.postedOn(formatDate(job.posted_at))}</span>
        ) : null}
        <span>{d.updatedOn(formatDate(job.last_seen_at))}</span>
      </div>
      <div className="drawer-body">
        {job.salary || job.work_style || job.salary_detail ? (
          <section className="drawer-section">
            <h3>{d.info}</h3>
            <dl className="job-facts-grid">
              {job.salary ? (
                <div>
                  <dt>{d.salaryRange}</dt>
                  <dd>{job.salary}</dd>
                </div>
              ) : null}
              {job.work_style ? (
                <div>
                  <dt>{d.workStyle}</dt>
                  <dd>{workStyleLabel(m, job.work_style)}</dd>
                </div>
              ) : null}
            </dl>
            {job.salary_detail ? (
              <div className="job-detail-block">
                <strong>{d.salaryDetail}</strong>
                <p>{job.salary_detail}</p>
              </div>
            ) : null}
            {job.work_style?.source_text ? (
              <div className="job-detail-block">
                <strong>{d.officeArrangement}</strong>
                <p>{job.work_style.source_text}</p>
              </div>
            ) : null}
          </section>
        ) : null}
        {job.description ? (
          <section className="drawer-section">
            <h3>{d.description}</h3>
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
            <h3>{d.requirements}</h3>
            {job.requirements?.must?.length ? (
              <div className="job-requirement-group">
                <strong>{d.must}</strong>
                <ul>
                  {job.requirements.must.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.requirements?.nice_to_have?.length ? (
              <div className="job-requirement-group">
                <strong>{d.niceToHave}</strong>
                <ul>
                  {job.requirements.nice_to_have.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {job.language_requirements?.length ? (
              <div className="job-requirement-group">
                <strong>{d.languages}</strong>
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
            <h3>{d.analysis}</h3>
            <div className="analysis-heading-actions">
              {job.match_analysis ? (
                <Check className="success-icon" size={17} />
              ) : null}
              <AiPromptButton
                className="analysis-copy-button"
                label={d.copyAnalysis}
                prompt={analysisPrompt}
                successDescription={d.analysisHint}
                onCheck={onRefresh}
              />
            </div>
          </div>
          <div className="analysis-card">
            <Analysis analysis={job.match_analysis} />
          </div>
        </section>
        <section className="drawer-section">
          <div className="section-label-row">
            <h3>{d.actions}</h3>
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
              {d.favorite}
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
              {d.skip}
            </button>
          </div>
          {isStatusLocked ? (
            <p
              className="drawer-job-actions-note"
              id="applied-job-actions-note"
            >
              {d.lockedNote}
            </p>
          ) : null}
        </section>
        <section className="drawer-section">
          <div className="section-label-row">
            <h3>{d.review}</h3>
            <span
              aria-live="polite"
              className={`review-save-status is-${reviewSaveState}`}
            >
              {reviewSaveState === "dirty" ? d.pendingSave : null}
              {reviewSaveState === "saving" ? (
                <>
                  <LoaderCircle className="spin" size={13} /> {t.common.saving}
                </>
              ) : null}
              {reviewSaveState === "saved" ? (
                <>
                  <Check size={13} /> {d.autosaved}
                </>
              ) : null}
              {reviewSaveState === "error" ? d.saveFailed : null}
            </span>
          </div>
          <div className="stack-form">
            <fieldset className="rating-field">
              <legend>{d.rating}</legend>
              <div className="rating-stars">
                {[1, 2, 3, 4, 5].map((score) => {
                  const selectedScore = Number(rating || 0);
                  const isSelected = score <= selectedScore;
                  return (
                    <button
                      aria-label={d.stars(score)}
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
                  {rating ? d.stars(rating) : d.notRated}
                </span>
              </div>
            </fieldset>
            <label className="field-label">
              <span>{d.notes}</span>
              <textarea
                maxLength={4000}
                onChange={(event) => changeNotes(event.target.value)}
                placeholder={d.notesPlaceholder}
                rows={4}
                value={notes}
              />
            </label>
          </div>
        </section>
        <section className="drawer-section application-callout">
          <h3>{d.application}</h3>
          {job.application ? (
            <>
              <p>
                {d.applicationStage}
                <StatusBadge
                  label={labelFor(
                    t.common.applicationStatus,
                    job.application.status,
                    session.application_labels[job.application.status],
                  )}
                  tone="info"
                />
              </p>
              <Button
                onClick={() => navigate(`/applications/${job.application?.id}`)}
                variant="secondary"
              >
                {d.viewApplication}
              </Button>
            </>
          ) : (
            <>
              <p>{d.noApplication}</p>
              <Button disabled={creating} onClick={createApplication}>
                {creating ? <LoaderCircle className="spin" size={15} /> : null}
                {d.createApplication}
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
  const { t } = useI18n();
  const m = t.dashboard;
  const [data, setData] = useState<import("../types").JobsResponse | null>(
    null,
  );
  const pageScrollPositionRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
        title: m.loadFailed,
        description: error instanceof Error ? error.message : m.checkService,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, showToast, m]);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (
        event.target.closest(
          ".job-drawer, .jobs-table tbody tr, .dialog-content, .dialog-overlay",
        )
      )
        return;
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
        <span>{m.loading}</span>
      </div>
    );
  if (!data)
    return (
      <EmptyState
        title={m.unavailableTitle}
        description={m.unavailableHint}
        action={<Button onClick={() => void load()}>{t.common.retry}</Button>}
      />
    );

  return (
    <div className={`dashboard-page${data.selected_job ? " has-drawer" : ""}`}>
      <PageIntro
        description={m.savedCount(data.total)}
        title={m.title}
        actions={
          <>
            <AiPromptButton
              label={m.copySearch}
              prompt={aiPrompts().jobSearch}
              successDescription={m.searchHint}
              onCheck={load}
            />
            <Button onClick={() => void load()} variant="secondary">
              <RefreshCw className={refreshing ? "spin" : ""} size={16} />
              {m.refresh}
            </Button>
          </>
        }
      />
      <Panel className="jobs-panel">
        <div className="jobs-import-note">
          <Info aria-hidden="true" size={16} />
          <p>
            <strong>{m.importLead}</strong>
            {m.importNote}
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search-box">
            <Search size={18} />
            <span className="sr-only">{m.searchLabel}</span>
            <input
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={m.searchPlaceholder}
              value={searchInput}
            />
          </label>
          <FilterSelect
            label={m.portalFilter}
            onChange={(value) => updateParams({ portal: value })}
            value={portal}
          >
            <option value="">{m.allPortals}</option>
            {data.portals.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label={m.recommendationFilter}
            onChange={(value) => updateParams({ recommendation: value })}
            value={recommendation}
          >
            <option value="">{m.allRecommendations}</option>
            <option value="pursue">{t.common.recommendation.pursue}</option>
            <option value="consider">{t.common.recommendation.consider}</option>
            <option value="skip">{t.common.recommendation.skip}</option>
            <option value="unanalyzed">{t.common.recommendation.none}</option>
          </FilterSelect>
          <FilterSelect
            label={m.ratingFilter}
            onChange={(value) => updateParams({ rating: value })}
            value={rating}
          >
            <option value="">{m.allRatings}</option>
            <option value="4">{m.fourPlus}</option>
            <option value="3">{m.threePlus}</option>
            <option value="unrated">{m.drawer.notRated}</option>
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
            {m.reset}
          </Button>
        </div>
        <div className="status-tabs" role="tablist">
          {JOB_STATUS_TABS.map(({ key, tab }) => (
            <button
              className={status === key ? "is-active" : ""}
              key={key}
              onClick={() => updateParams({ status: key })}
              type="button"
            >
              {m.tabs[tab]}{" "}
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
            title={data.total ? m.noMatchTitle : m.noJobsTitle}
            description={data.total ? m.noMatchHint : m.noJobsHint}
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
