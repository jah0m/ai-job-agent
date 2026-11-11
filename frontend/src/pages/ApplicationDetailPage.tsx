import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  Check,
  ExternalLink,
  FileDown,
  FileText,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, postForm, postUrlEncoded } from "../api";
import { AiPromptButton } from "../components/AiPromptButton";
import {
  Button,
  EmptyState,
  PageIntro,
  Panel,
  StatusBadge,
  useToast,
} from "../components/Layout";
import { NextActionEditor } from "../components/NextActionEditor";
import {
  fileName,
  filePurpose,
  formatBytes,
  formatDate,
  labelFor,
} from "../format";
import { type Messages, useI18n } from "../i18n";
import { preparationState } from "../preparation";
import {
  buildApplicationDiscussionPrompt,
  buildApplicationPromptFallback,
} from "../prompts";
import type {
  Application,
  Draft,
  FileEntry,
  MaterialPackage,
  Session,
  ValidationResult,
} from "../types";

const documentNames = [{ path: "shokumu-keirekisho.md", title: "職務経歴書" }];

function validationItems(validation?: ValidationResult) {
  if (!validation)
    return { errors: [], missing: [], placeholders: [], ready: false };
  const list = (key: string) =>
    Array.isArray(validation[key]) ? validation[key].map(String) : [];
  return {
    errors: list("errors"),
    missing: list("missing"),
    placeholders: list("placeholders"),
    ready: Boolean(validation.ready || validation.valid),
  };
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function downloadDraftUrl(applicationId: string, path: string) {
  return `/applications/${encodeURIComponent(applicationId)}/draft/files/${encodedPath(path)}`;
}

function packageFileUrl(
  applicationId: string,
  packageId: string,
  path: string,
) {
  return `/applications/${encodeURIComponent(applicationId)}/packages/${encodeURIComponent(packageId)}/files/${encodedPath(path)}`;
}

function previewUrl(applicationId: string, path: string, packageId?: string) {
  return packageId
    ? `/applications/${encodeURIComponent(applicationId)}/packages/${encodeURIComponent(packageId)}/preview/${encodedPath(path)}`
    : `/applications/${encodeURIComponent(applicationId)}/draft/preview/${encodedPath(path)}`;
}

function MaterialRow({
  file,
  applicationId,
  packageId,
  onRemove,
}: {
  file: FileEntry;
  applicationId: string;
  packageId?: string;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const m = t.detail;
  const download = packageId
    ? packageFileUrl(applicationId, packageId, file.path)
    : downloadDraftUrl(applicationId, file.path);
  const isPdf = file.path.toLowerCase().endsWith(".pdf");
  const isMarkdown = file.path.endsWith(".md");
  const isApplicationMarkdown = file.path === "shokumu-keirekisho.md";
  const canPreviewMarkdown = packageId ? isMarkdown : isApplicationMarkdown;
  const preview = canPreviewMarkdown
    ? previewUrl(applicationId, file.path, packageId)
    : download;
  return (
    <div className="material-row">
      <div className="file-icon">
        <FileText size={18} />
      </div>
      <div className="file-copy">
        <strong>{fileName(file.path)}</strong>
        <span>
          {filePurpose(file.purpose)} ·{" "}
          {file.path.split(".").at(-1)?.toUpperCase()}
          {file.size ? ` · ${formatBytes(file.size)}` : ""}
        </span>
      </div>
      <div className="row-actions">
        {canPreviewMarkdown ? (
          <Link
            aria-label={m.preview(fileName(file.path))}
            className="icon-action"
            to={preview}
          >
            <FileText size={15} />
          </Link>
        ) : null}
        {isPdf ? (
          <a
            aria-label={m.preview(fileName(file.path))}
            className="icon-action"
            href={download}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={15} />
          </a>
        ) : (
          <a
            aria-label={m.download(fileName(file.path))}
            className="icon-action"
            download
            href={download}
          >
            <FileDown size={15} />
          </a>
        )}
        {!packageId && isApplicationMarkdown ? (
          <Link
            aria-label={m.edit(fileName(file.path))}
            className="icon-action"
            to={`/applications/${encodeURIComponent(applicationId)}/draft/edit/${encodedPath(file.path)}`}
          >
            <Pencil size={15} />
          </Link>
        ) : null}
        {onRemove ? (
          <button
            aria-label={m.remove(fileName(file.path))}
            className="icon-action danger"
            onClick={onRemove}
            type="button"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ValidationBanner({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const m = t.detail.validation;
  const validation = validationItems(draft.validation);
  if (validation.ready)
    return (
      <div
        aria-live="polite"
        className="validation-banner validation-ready"
        role="status"
      >
        <Check size={16} />
        <span>{m.ready}</span>
      </div>
    );
  if (
    !validation.errors.length &&
    !validation.missing.length &&
    !validation.placeholders.length
  )
    return (
      <div aria-live="polite" className="validation-banner" role="status">
        <FileText size={16} />
        <span>{m.notSaved}</span>
      </div>
    );
  return (
    <div
      aria-live="polite"
      className="validation-banner validation-warning"
      role="status"
    >
      <Archive size={16} />
      <div>
        <strong>{m.problems}</strong>
        {validation.missing.length ? (
          <p>{m.missing(validation.missing.join(m.separator))}</p>
        ) : null}
        {validation.errors.length ? (
          <ul>
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {validation.placeholders.length ? (
          <p>{m.placeholders(validation.placeholders.join(m.separator))}</p>
        ) : null}
      </div>
    </div>
  );
}

type ActivityEvent = Application["events"][number];

function activityEventKey(event: ActivityEvent): string {
  if (event.type.startsWith("action.")) {
    return `${event.type}:${JSON.stringify(event.data)}`;
  }
  if (event.type === "status.changed") {
    return `${event.type}:${String(event.data.status)}:${String(event.data.note ?? "")}`;
  }
  return event.type;
}

function compactActivityEvents(events: ActivityEvent[]): ActivityEvent[] {
  const compacted: ActivityEvent[] = [];
  for (const event of events.slice().reverse()) {
    const previous = compacted.at(-1);
    if (previous && activityEventKey(previous) === activityEventKey(event)) {
      continue;
    }
    compacted.push(event);
  }
  return compacted;
}

function ActivityItem({
  event,
  labels,
}: {
  event: ActivityEvent;
  labels: Record<string, string>;
}) {
  const { t } = useI18n();
  const snapshot =
    event.type === "action.clear" ? event.data.before : event.data.after;
  const action =
    event.type.startsWith("action.") && snapshot && typeof snapshot === "object"
      ? (snapshot as Record<string, unknown>)
      : null;
  return (
    <li key={`${event.type}-${event.created_at}-${JSON.stringify(event.data)}`}>
      <span className="activity-dot" />
      <div>
        <strong>{eventLabel(t, event.type, event.data, labels)}</strong>
        {action ? (
          <p>
            {String(action.title ?? "")}
            {action.due_date
              ? t.detail.activity.due(String(action.due_date))
              : t.detail.activity.noDate}
          </p>
        ) : null}
        {typeof event.data.note === "string" ? <p>{event.data.note}</p> : null}
        <time>{formatDate(event.created_at, true)}</time>
      </div>
    </li>
  );
}

function SubmissionDialog({
  application,
  draft,
  onDone,
}: {
  application: Application;
  draft: Draft;
  onDone: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.detail.submission;
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState("exact_files");
  const [packageId, setPackageId] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [submittedAt, setSubmittedAt] = useState("");
  const [channel, setChannel] = useState("company_portal");
  const [externalReference, setExternalReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedPackage = application.packages.find(
    (item) => item.id === packageId,
  );
  const availableFiles = useMemo(
    () =>
      packageId ? (selectedPackage?.files ?? []) : draft.deliverable_files,
    [draft.deliverable_files, packageId, selectedPackage],
  );
  const exactFiles = availableFiles.filter(
    (file) => file.path.endsWith(".pdf") || file.path.endsWith(".docx"),
  );

  useEffect(() => {
    if (evidence === "status_only") {
      setPackageId("");
      setSelectedFiles([]);
    }
  }, [evidence]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/submit`,
        {
          expected_revision: draft.revision,
          package_id: evidence === "status_only" ? "" : packageId,
          evidence_level: evidence,
          selected_files: evidence === "exact_files" ? selectedFiles : [],
          submitted_at: submittedAt,
          channel,
          external_reference: externalReference,
          note,
        },
      );
      setOpen(false);
      showToast({
        title: m.saved,
        description: m.savedHint,
      });
      await onDone();
    } catch (error) {
      showToast({
        title: m.failed,
        description: error instanceof Error ? error.message : m.failedHint,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <Button>
          <PackageCheck size={16} />
          {m.trigger}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content submission-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{m.title}</Dialog.Title>
              <Dialog.Description>{m.description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label={t.common.close}
                className="icon-button"
                type="button"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <form className="stack-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field-label">
                <span>{m.evidence}</span>
                <select
                  onChange={(event) => setEvidence(event.target.value)}
                  value={evidence}
                >
                  <option value="exact_files">{m.exactRecommended}</option>
                  <option value="source_only">
                    {m.evidenceLevels.source_only}
                  </option>
                  <option value="status_only">{m.statusOnlyOption}</option>
                </select>
              </label>
              <label className="field-label">
                <span>{m.source}</span>
                <select
                  disabled={evidence === "status_only"}
                  onChange={(event) => {
                    setPackageId(event.target.value);
                    setSelectedFiles([]);
                  }}
                  value={packageId}
                >
                  <option value="">{m.currentSource}</option>
                  {application.packages
                    .slice()
                    .reverse()
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label || item.id} ·{" "}
                        {formatDate(item.created_at, true)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                <span>{m.submittedAt}</span>
                <input
                  onChange={(event) => setSubmittedAt(event.target.value)}
                  type="datetime-local"
                  value={submittedAt}
                />
              </label>
              <label className="field-label">
                <span>{m.channel}</span>
                <select
                  onChange={(event) => setChannel(event.target.value)}
                  value={channel}
                >
                  {Object.entries(m.channels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {evidence === "exact_files" ? (
              <fieldset className="file-checklist">
                <legend>{m.sentFiles}</legend>
                {exactFiles.length ? (
                  exactFiles.map((file) => (
                    <label key={file.path}>
                      <input
                        checked={selectedFiles.includes(file.path)}
                        onChange={(event) =>
                          setSelectedFiles((current) =>
                            event.target.checked
                              ? [...current, file.path]
                              : current.filter((path) => path !== file.path),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{fileName(file.path)}</span>
                    </label>
                  ))
                ) : (
                  <p>{m.noExactFiles}</p>
                )}
              </fieldset>
            ) : null}
            <div className="form-grid">
              <label className="field-label">
                <span>{m.externalReference}</span>
                <input
                  onChange={(event) => setExternalReference(event.target.value)}
                  value={externalReference}
                />
              </label>
              <label className="field-label">
                <span>{m.note}</span>
                <input
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">{t.common.cancel}</Button>
              </Dialog.Close>
              <Button disabled={saving} type="submit">
                {saving ? <LoaderCircle className="spin" size={15} /> : null}
                {m.confirm}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ApplicationDetailPage({ session }: { session: Session }) {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.detail;
  const [application, setApplication] = useState<Application | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [deliverablePurpose, setDeliverablePurpose] =
    useState("shokumu_keirekisho");
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);
  const [packageLabel, setPackageLabel] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicationId) return;
    try {
      const data = await api.application(applicationId);
      setApplication({ ...data.application, ai_prompt: data.ai_prompt });
      setDraft(data.draft);
      setSelectedStatus(data.application.status);
    } catch (error) {
      showToast({
        title: m.loadFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    } finally {
      setLoading(false);
    }
  }, [applicationId, showToast, m, t]);
  useEffect(() => {
    void load();
  }, [load]);
  // The anchor target only exists after the async load, so the browser's own
  // hash navigation has already missed it.
  useEffect(() => {
    if (loading || window.location.hash !== "#next-action") return;
    document.getElementById("next-action")?.scrollIntoView({ block: "start" });
  }, [loading]);

  const mutate = async (key: string, action: () => Promise<Response>) => {
    setBusy(key);
    try {
      await action();
      await load();
    } catch (error) {
      showToast({
        title: m.actionFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.loading}</span>
      </div>
    );
  if (!application || !draft)
    return (
      <EmptyState
        description={m.notFoundHint}
        title={m.notFoundTitle}
        action={
          <Button onClick={() => navigate("/applications")} variant="secondary">
            {m.backToBoard}
          </Button>
        }
      />
    );

  const draftPaths = new Set(draft.files.map((file) => file.path));
  const preparation = preparationState(application, draft);
  const hasSourceDocuments = preparation.contentReady;
  const hasDeliverables = preparation.hasDeliverables;
  const hasMaterialPackage = preparation.steps[2];
  const hasSubmissionRecord = application.submissions.length > 0;
  const canDeleteApplication =
    draft.revision === 0 &&
    draft.status === "empty" &&
    draft.files.length === 0 &&
    application.packages.length === 0 &&
    application.submissions.length === 0;
  const preparationSteps = preparation.steps;
  const completedPreparationSteps = preparationSteps.filter(Boolean).length;
  const currentPreparationStep = preparationSteps.findIndex(
    (isComplete) => !isComplete,
  );
  const preparationStepClass = (index: number, isComplete: boolean) =>
    isComplete
      ? "is-complete"
      : currentPreparationStep === index
        ? "is-current"
        : "is-pending";
  const aiPrompt =
    application.ai_prompt ?? buildApplicationPromptFallback(application.id);
  const updateStatus = () =>
    mutate("status", () =>
      postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/status`,
        { status: selectedStatus, note: statusNote },
      ),
    );
  const uploadDeliverable = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deliverableFile) {
      showToast({ title: m.chooseFile });
      return;
    }
    return mutate("deliverable", () =>
      postForm(
        `/applications/${encodeURIComponent(application.id)}/materials/upload-deliverable`,
        {
          expected_revision: draft.revision,
          purpose: deliverablePurpose,
          role: "deliverable",
          origin: "external_export",
        },
        { file: deliverableFile },
      ),
    );
  };
  const removeFile = (path: string) => {
    if (!window.confirm(m.confirmRemove)) return;
    void mutate("remove", () =>
      postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/materials/remove-deliverable`,
        { expected_revision: draft.revision, relative_path: path },
      ),
    );
  };
  const lockPackage = () =>
    void mutate("package", () =>
      postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/materials/package`,
        { expected_revision: draft.revision, label: packageLabel },
      ),
    );
  const discardDraft = () => {
    if (!window.confirm(m.confirmDiscard)) return;
    void mutate("discard", () =>
      postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/draft/discard`,
        { expected_revision: draft.revision },
      ),
    );
  };
  const deleteApplication = async () => {
    if (!canDeleteApplication || busy === "delete") return;
    if (!window.confirm(m.confirmDelete)) return;
    setBusy("delete");
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/delete`,
        {},
      );
      navigate("/applications");
    } catch (error) {
      showToast({
        title: m.deleteFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    } finally {
      setBusy(null);
    }
  };
  const activityEvents = compactActivityEvents(application.events);
  const recentActivityEvents = activityEvents.slice(0, 6);
  const olderActivityEvents = activityEvents.slice(6);

  return (
    <div className="application-detail-page">
      <PageIntro
        description={application.company}
        title={application.role}
        actions={
          <>
            <AiPromptButton
              label={m.copyDiscussion}
              prompt={buildApplicationDiscussionPrompt(application.id)}
              successDescription={m.discussionHint}
              onCheck={load}
            />
            {application.job_url ? (
              <a
                className="button button-secondary"
                href={application.job_url}
                rel="noreferrer"
                target="_blank"
              >
                {m.viewJob}
                <ExternalLink size={15} />
              </a>
            ) : null}
            <Link className="button button-ghost" to="/applications">
              {m.backToBoardShort}
            </Link>
          </>
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <div id="next-action">
            <NextActionEditor
              key={`${application.id}:${application.next_action.revision}`}
              applicationId={application.id}
              action={application.next_action}
              onDone={load}
            />
          </div>
          <Panel className="workflow-card compact-workflow">
            <div className="section-heading">
              <div>
                <span className="page-eyebrow">{m.stage.eyebrow}</span>
                <h2>{m.stage.title}</h2>
              </div>
              <span>
                {m.stage.lastUpdated(formatDate(application.updated_at, true))}
              </span>
            </div>
            <div className="status-update-row">
              <label className="field-label">
                <span className="sr-only">{m.stage.title}</span>
                <select
                  onChange={(event) => setSelectedStatus(event.target.value)}
                  value={selectedStatus}
                >
                  {Object.entries(session.application_labels).map(
                    ([key, label]) => (
                      <option
                        disabled={
                          key === "applied" && application.status !== "applied"
                        }
                        key={key}
                        value={key}
                      >
                        {labelFor(t.common.applicationStatus, key, label)}
                        {key === "applied" && application.status !== "applied"
                          ? m.stage.viaSubmission
                          : ""}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <input
                onChange={(event) => setStatusNote(event.target.value)}
                placeholder={m.stage.notePlaceholder}
                value={statusNote}
              />
              <Button disabled={busy === "status"} onClick={updateStatus}>
                {busy === "status" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : null}
                {m.stage.update}
              </Button>
            </div>
          </Panel>
          <Panel className="workflow-card preparation-card">
            <div className="section-heading preparation-heading">
              <div>
                <span className="page-eyebrow">{m.prep.title}</span>
                <h2>{m.prep.title}</h2>
                <p>{m.prep.intro}</p>
              </div>
              <strong>{m.prep.count(completedPreparationSteps)}</strong>
            </div>
            <div
              aria-label={m.prep.progressLabel(completedPreparationSteps)}
              aria-valuemax={3}
              aria-valuemin={0}
              aria-valuenow={completedPreparationSteps}
              className="preparation-progress"
              role="progressbar"
            >
              <span
                style={{ width: `${(completedPreparationSteps / 3) * 100}%` }}
              />
            </div>
            <ol className="preparation-steps" aria-label={m.prep.title}>
              <li
                className={`preparation-step ${preparationStepClass(0, hasSourceDocuments)}`}
                id="preparation-documents"
              >
                <div className="step-marker" aria-hidden="true">
                  {hasSourceDocuments ? <Check size={14} /> : "1"}
                </div>
                <div className="step-content">
                  <div className="step-heading">
                    <div>
                      <h3>{m.prep.step1Title}</h3>
                      <p>{m.prep.step1Hint}</p>
                    </div>
                    <span className="step-state">
                      {hasSourceDocuments
                        ? m.prep.step1Passed
                        : preparation.hasSource
                          ? m.prep.step1NeedsFix
                          : m.prep.step1Todo}
                    </span>
                  </div>
                  <div className="step-surface">
                    <ValidationBanner draft={draft} />
                    <div className="material-list">
                      {documentNames.map(({ path, title }) =>
                        draftPaths.has(path) ? (
                          <div className="material-row" key={path}>
                            <div className="file-icon">
                              <FileText size={18} />
                            </div>
                            <div className="file-copy">
                              <strong>{title}</strong>
                              <span>{path}</span>
                            </div>
                            <div className="row-actions">
                              <Link
                                aria-label={m.preview(title)}
                                className="icon-action"
                                to={previewUrl(application.id, path)}
                              >
                                <FileText size={15} />
                              </Link>
                              <Link
                                aria-label={m.edit(title)}
                                className="icon-action"
                                to={`/applications/${encodeURIComponent(application.id)}/draft/edit/${encodedPath(path)}`}
                              >
                                <Pencil size={15} />
                              </Link>
                              <a
                                aria-label={m.download(title)}
                                className="icon-action"
                                download
                                href={downloadDraftUrl(application.id, path)}
                              >
                                <FileDown size={15} />
                              </a>
                            </div>
                          </div>
                        ) : (
                          <Link
                            className="material-row empty-material"
                            key={path}
                            to={`/applications/${encodeURIComponent(application.id)}/draft/edit/${encodedPath(path)}`}
                          >
                            <div className="file-icon muted">
                              <Plus size={18} />
                            </div>
                            <div className="file-copy">
                              <strong>{title}</strong>
                              <span>{m.prep.notCreated}</span>
                            </div>
                            <Plus size={16} />
                          </Link>
                        ),
                      )}
                    </div>
                    <div className="source-start">
                      <div className="source-start-copy">
                        <span>{m.prep.shortcut}</span>
                        <strong>{m.prep.draftWithCodex}</strong>
                        <p>{m.prep.draftWithCodexHint}</p>
                      </div>
                      <div className="source-start-actions">
                        <AiPromptButton
                          label={m.prep.copyDraftPrompt}
                          prompt={aiPrompt}
                          successDescription={m.prep.draftPromptHint}
                          onCheck={load}
                        />
                      </div>
                    </div>
                    <div className="step-footer-actions">
                      <span>{m.prep.currentRevision(draft.revision)}</span>
                      <Button
                        disabled={busy === "discard"}
                        onClick={discardDraft}
                        variant="ghost"
                      >
                        {m.prep.discard}
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
              <li
                className={`preparation-step ${preparationStepClass(1, hasDeliverables)}`}
                id="preparation-files"
              >
                <div className="step-marker" aria-hidden="true">
                  {hasDeliverables ? <Check size={14} /> : "2"}
                </div>
                <div className="step-content">
                  <div className="step-heading">
                    <div>
                      <h3>{m.prep.step2Title}</h3>
                      <p>{m.prep.step2Hint}</p>
                    </div>
                    <span className="step-state">
                      {hasDeliverables ? m.prep.step2Done : m.prep.step2Todo}
                    </span>
                  </div>
                  <div className="step-surface">
                    <div className="material-list">
                      {draft.deliverable_files.length ? (
                        draft.deliverable_files.map((file) => (
                          <MaterialRow
                            file={file}
                            key={file.path}
                            applicationId={application.id}
                            onRemove={() => removeFile(file.path)}
                          />
                        ))
                      ) : (
                        <div className="section-empty">
                          {m.prep.noDeliverables}
                        </div>
                      )}
                    </div>
                    <form className="upload-form" onSubmit={uploadDeliverable}>
                      <div className="form-grid">
                        <label className="field-label">
                          <span>{m.prep.purpose}</span>
                          <select
                            onChange={(event) =>
                              setDeliverablePurpose(event.target.value)
                            }
                            value={deliverablePurpose}
                          >
                            <option value="shokumu_keirekisho">
                              {t.common.filePurpose.shokumu_keirekisho}
                            </option>
                            <option value="rirekisho">
                              {t.common.filePurpose.rirekisho}
                            </option>
                            <option value="employer_form">
                              {m.prep.employerFormOption}
                            </option>
                            <option value="portfolio">
                              {t.common.filePurpose.portfolio}
                            </option>
                            <option value="other">
                              {t.common.filePurpose.other}
                            </option>
                          </select>
                        </label>
                        <div className="field-label">
                          <span>{m.prep.file}</span>
                          <label className="file-picker">
                            <Upload size={16} />
                            <span>
                              {deliverableFile?.name ?? m.prep.choosePdf}
                            </span>
                            <input
                              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={(event) =>
                                setDeliverableFile(
                                  event.target.files?.[0] ?? null,
                                )
                              }
                              type="file"
                            />
                          </label>
                        </div>
                      </div>
                      <Button disabled={busy === "deliverable"} type="submit">
                        {busy === "deliverable" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : null}
                        {m.prep.upload}
                      </Button>
                    </form>
                    <div className="external-format-note">
                      <div className="note-icon">
                        <ExternalLink size={16} />
                      </div>
                      <div>
                        <strong>{m.prep.externalTitle}</strong>
                        <p>{m.prep.externalHint}</p>
                        <p>
                          {m.prep.studioBefore}{" "}
                          <a
                            href="https://md-resume.jahom.dev/"
                            rel="noreferrer"
                            target="_blank"
                          >
                            Markdown Resume Studio
                          </a>{" "}
                          {m.prep.studioAfter}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
              <li
                className={`preparation-step ${preparationStepClass(2, hasMaterialPackage)}`}
                id="preparation-package"
              >
                <div className="step-marker" aria-hidden="true">
                  {hasMaterialPackage ? <Check size={14} /> : "3"}
                </div>
                <div className="step-content">
                  <div className="step-heading">
                    <div>
                      <h3>{m.prep.step3Title}</h3>
                      <p>{m.prep.step3Hint}</p>
                    </div>
                    <span className="step-state">
                      {hasMaterialPackage ? m.prep.step3Done : m.prep.step3Todo}
                    </span>
                  </div>
                  <div className="step-surface">
                    <div className="package-save-controls">
                      <label className="package-label-input">
                        <span>{m.prep.packageLabel}</span>
                        <input
                          maxLength={120}
                          onChange={(event) =>
                            setPackageLabel(event.target.value)
                          }
                          placeholder={m.prep.packageLabelPlaceholder}
                          value={packageLabel}
                        />
                      </label>
                      <Button
                        disabled={
                          busy === "package" ||
                          !hasSourceDocuments ||
                          !hasDeliverables
                        }
                        onClick={lockPackage}
                        variant="secondary"
                      >
                        {busy === "package" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <LockKeyhole size={15} />
                        )}
                        {m.prep.savePackage}
                      </Button>
                    </div>
                    <details
                      className="accordion package-history"
                      open={openSection === "packages"}
                      onToggle={(event) =>
                        setOpenSection(
                          event.currentTarget.open ? "packages" : null,
                        )
                      }
                    >
                      <summary>
                        <span>{m.prep.history}</span>
                        <span className="summary-count">
                          {application.packages.length}
                        </span>
                      </summary>
                      <div className="accordion-body">
                        <p className="field-hint">{m.prep.historyHint}</p>
                        {application.packages.length ? (
                          <div className="package-list">
                            {application.packages
                              .slice()
                              .reverse()
                              .map((item) => (
                                <PackageRow
                                  applicationId={application.id}
                                  item={item}
                                  key={item.id}
                                  onRestore={() =>
                                    void mutate("restore", () =>
                                      postUrlEncoded(
                                        `/applications/${encodeURIComponent(application.id)}/packages/${encodeURIComponent(item.id)}/restore`,
                                        { expected_revision: draft.revision },
                                      ),
                                    )
                                  }
                                  onDelete={() => {
                                    if (
                                      window.confirm(
                                        m.prep.confirmDeletePackage,
                                      )
                                    )
                                      void mutate("delete-package", () =>
                                        postUrlEncoded(
                                          `/applications/${encodeURIComponent(application.id)}/packages/${encodeURIComponent(item.id)}/delete`,
                                          {},
                                        ),
                                      );
                                  }}
                                />
                              ))}
                          </div>
                        ) : (
                          <div className="section-empty">
                            {m.prep.noPackages}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </li>
            </ol>
          </Panel>
          <Panel className="workflow-card">
            <div
              className={`submission-record-section${hasSubmissionRecord ? " is-complete" : ""}`}
              id="preparation-submission"
            >
              <div className="step-content">
                <div className="step-heading">
                  <div>
                    <h3>{m.record.title}</h3>
                    <p>{m.record.hint}</p>
                  </div>
                  <span className="step-state">
                    {hasSubmissionRecord ? m.record.done : m.record.todo}
                  </span>
                </div>
                <div className="step-surface">
                  <div className="submission-action-row">
                    <p>{m.record.explain}</p>
                    <SubmissionDialog
                      application={application}
                      draft={draft}
                      onDone={load}
                    />
                  </div>
                  {application.submissions.length ? (
                    <div className="submission-history">
                      {application.submissions
                        .slice()
                        .reverse()
                        .map((submission) => (
                          <article
                            className="submission-row"
                            key={submission.id}
                          >
                            <div className="timeline-dot" />
                            <div>
                              <strong>
                                {formatDate(
                                  submission.submitted_at ||
                                    submission.recorded_at,
                                  true,
                                )}
                              </strong>
                              <span>
                                {labelFor(
                                  m.submission.evidenceLevels,
                                  submission.evidence_level,
                                )}{" "}
                                ·{" "}
                                {labelFor(
                                  m.submission.channels,
                                  submission.channel,
                                )}
                              </span>
                              <p>
                                {submission.package_id ? (
                                  <>
                                    {m.record.package}{" "}
                                    <code>{submission.package_id}</code>
                                  </>
                                ) : (
                                  m.record.noPackage
                                )}
                                {submission.files.length
                                  ? m.record.savedFiles(submission.files.length)
                                  : ""}
                              </p>
                              {submission.note ? (
                                <small>{submission.note}</small>
                              ) : null}
                            </div>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <div className="section-empty large-empty">
                      {m.record.empty}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
          <section
            aria-labelledby="application-delete-heading"
            className="panel application-danger-zone"
          >
            <div className="danger-zone-heading">
              <div>
                <span className="page-eyebrow">{m.danger.eyebrow}</span>
                <h2 id="application-delete-heading">{m.danger.title}</h2>
                <p>{m.danger.hint}</p>
              </div>
              <Button
                className="danger-button"
                disabled={!canDeleteApplication || busy === "delete"}
                onClick={() => void deleteApplication()}
                variant="danger"
              >
                {busy === "delete" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Trash2 size={15} />
                )}
                {m.danger.title}
              </Button>
            </div>
            <p className="danger-zone-hint">
              {canDeleteApplication
                ? m.danger.canDelete
                : m.danger.cannotDelete}
            </p>
          </section>
        </div>
        <aside className="activity-panel">
          <div className="activity-heading">
            <div>
              <span className="page-eyebrow">{m.activityPanel.eyebrow}</span>
              <h2>{m.activityPanel.title}</h2>
            </div>
            <Archive size={18} />
          </div>
          {recentActivityEvents.length ? (
            <>
              <ol className="activity-list">
                {recentActivityEvents.map((event) => (
                  <ActivityItem
                    event={event}
                    key={`${event.type}-${event.created_at}-${JSON.stringify(event.data)}`}
                    labels={session.application_labels}
                  />
                ))}
              </ol>
              {olderActivityEvents.length ? (
                <details className="activity-more">
                  <summary>
                    {m.activityPanel.older(olderActivityEvents.length)}
                  </summary>
                  <ol className="activity-list activity-list-more">
                    {olderActivityEvents.map((event) => (
                      <ActivityItem
                        event={event}
                        key={`${event.type}-${event.created_at}-${JSON.stringify(event.data)}`}
                        labels={session.application_labels}
                      />
                    ))}
                  </ol>
                </details>
              ) : null}
            </>
          ) : (
            <div className="section-empty">{m.activityPanel.empty}</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PackageRow({
  item,
  applicationId,
  onRestore,
  onDelete,
}: {
  item: MaterialPackage;
  applicationId: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const m = t.detail.packageRow;
  const deliverables = item.files.filter(
    (file) => file.path.endsWith(".pdf") || file.path.endsWith(".docx"),
  );
  return (
    <article className="package-row">
      <div className="package-row-heading">
        <div className="package-icon">
          <PackageCheck size={17} />
        </div>
        <div>
          <strong>{item.label || m.fallback}</strong>
          <span>
            {m.meta(formatDate(item.created_at, true), item.files.length)}
          </span>
        </div>
        {item.is_submitted ? (
          <StatusBadge label={m.submitted} tone="success" />
        ) : (
          <StatusBadge label={m.unbound} tone="neutral" />
        )}
      </div>
      <div className="package-files">
        {item.files.map((file) => {
          const isMarkdown = file.path.endsWith(".md");
          const isPdf = file.path.toLowerCase().endsWith(".pdf");
          return (
            <Link
              key={file.path}
              rel={isPdf ? "noreferrer" : undefined}
              reloadDocument={!isMarkdown}
              target={isPdf ? "_blank" : undefined}
              to={
                isMarkdown
                  ? previewUrl(applicationId, file.path, item.id)
                  : packageFileUrl(applicationId, item.id, file.path)
              }
            >
              {fileName(file.path)}
            </Link>
          );
        })}
      </div>
      <div className="package-row-actions">
        {deliverables.length ? (
          <span className="package-ready">
            <Check size={14} />
            {m.exactEvidence}
          </span>
        ) : null}
        {!item.is_submitted ? (
          <>
            <Button onClick={onRestore} variant="ghost">
              <Archive size={14} />
              {m.restore}
            </Button>
            <Button
              onClick={onDelete}
              variant="ghost"
              className="danger-button"
            >
              <Trash2 size={14} />
              {m.delete}
            </Button>
          </>
        ) : (
          <span className="locked-note">
            <LockKeyhole size={14} />
            {m.keptForever}
          </span>
        )}
      </div>
    </article>
  );
}

function eventLabel(
  t: Messages,
  type: string,
  data: Record<string, unknown>,
  labels: Record<string, string>,
): string {
  if (type === "status.changed") {
    const status = data.status == null ? "" : String(data.status);
    return t.detail.activity.statusChanged(
      status
        ? labelFor(t.common.applicationStatus, status, labels[status])
        : t.common.unknown,
    );
  }
  return labelFor(t.detail.activity.events, type);
}
