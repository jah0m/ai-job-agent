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
import { fileName, filePurpose, formatBytes, formatDate } from "../format";
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

const documentNames = [
  { path: "rirekisho.md", title: "履歴書" },
  { path: "shokumu-keirekisho.md", title: "职务经历书" },
];

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
  const download = packageId
    ? packageFileUrl(applicationId, packageId, file.path)
    : downloadDraftUrl(applicationId, file.path);
  const isPdf = file.path.toLowerCase().endsWith(".pdf");
  const preview = file.path.endsWith(".md")
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
        {file.path.endsWith(".md") ? (
          <Link
            aria-label={`预览 ${fileName(file.path)}`}
            className="icon-action"
            to={preview}
          >
            <FileText size={15} />
          </Link>
        ) : null}
        {isPdf ? (
          <a
            aria-label={`预览 ${fileName(file.path)}`}
            className="icon-action"
            href={download}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={15} />
          </a>
        ) : (
          <a
            aria-label={`下载 ${fileName(file.path)}`}
            className="icon-action"
            download
            href={download}
          >
            <FileDown size={15} />
          </a>
        )}
        {!packageId && file.path.endsWith(".md") ? (
          <Link
            aria-label={`编辑 ${fileName(file.path)}`}
            className="icon-action"
            to={`/applications/${encodeURIComponent(applicationId)}/draft/edit/${encodedPath(file.path)}`}
          >
            <Pencil size={15} />
          </Link>
        ) : null}
        {onRemove ? (
          <button
            aria-label={`移除 ${fileName(file.path)}`}
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
  const validation = validationItems(draft.validation);
  if (validation.ready)
    return (
      <div
        aria-live="polite"
        className="validation-banner validation-ready"
        role="status"
      >
        <Check size={16} />
        <span>自动检查通过：两份 Markdown 已通过基础检查。</span>
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
        <span>自动检查：尚未保存两份申请材料。</span>
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
        <strong>自动检查发现问题</strong>
        {validation.missing.length ? (
          <p>缺少：{validation.missing.join("、")}</p>
        ) : null}
        {validation.errors.length ? (
          <ul>
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        {validation.placeholders.length ? (
          <p>仍有“要确认”占位符：{validation.placeholders.join("、")}</p>
        ) : null}
      </div>
    </div>
  );
}

type ActivityEvent = Application["events"][number];

function activityEventKey(event: ActivityEvent): string {
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
  return (
    <li key={`${event.type}-${event.created_at}-${JSON.stringify(event.data)}`}>
      <span className="activity-dot" />
      <div>
        <strong>{eventLabel(event.type, event.data, labels)}</strong>
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
        title: "投递记录已保存",
        description: "这次记录已绑定对应的材料快照。",
      });
      await onDone();
    } catch (error) {
      showToast({
        title: "记录失败",
        description:
          error instanceof Error ? error.message : "请检查材料和证据级别",
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
          记录已投递
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content submission-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>记录已完成的投递</Dialog.Title>
              <Dialog.Description>
                只记录你已在外部完成的申请，不会发送文件。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button aria-label="关闭" className="icon-button" type="button">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <form className="stack-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field-label">
                <span>证据级别</span>
                <select
                  onChange={(event) => setEvidence(event.target.value)}
                  value={evidence}
                >
                  <option value="exact_files">精确文件（推荐）</option>
                  <option value="source_only">仅材料来源</option>
                  <option value="status_only">仅记录状态</option>
                </select>
              </label>
              <label className="field-label">
                <span>材料来源</span>
                <select
                  disabled={evidence === "status_only"}
                  onChange={(event) => {
                    setPackageId(event.target.value);
                    setSelectedFiles([]);
                  }}
                  value={packageId}
                >
                  <option value="">当前材料（投递时自动保存）</option>
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
                <span>实际投递时间</span>
                <input
                  onChange={(event) => setSubmittedAt(event.target.value)}
                  type="datetime-local"
                  value={submittedAt}
                />
              </label>
              <label className="field-label">
                <span>渠道</span>
                <select
                  onChange={(event) => setChannel(event.target.value)}
                  value={channel}
                >
                  <option value="company_portal">公司招聘页</option>
                  <option value="email">邮件</option>
                  <option value="recruiting_agent">猎头 / 中介</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="other">其他</option>
                </select>
              </label>
            </div>
            {evidence === "exact_files" ? (
              <fieldset className="file-checklist">
                <legend>本次实际发送的文件</legend>
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
                  <p>
                    当前材料没有 PDF / DOCX，请先上传；或者改用“仅材料来源”。
                  </p>
                )}
              </fieldset>
            ) : null}
            <div className="form-grid">
              <label className="field-label">
                <span>外部编号或链接（可选）</span>
                <input
                  onChange={(event) => setExternalReference(event.target.value)}
                  value={externalReference}
                />
              </label>
              <label className="field-label">
                <span>备注（可选）</span>
                <input
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button variant="secondary">取消</Button>
              </Dialog.Close>
              <Button disabled={saving} type="submit">
                {saving ? <LoaderCircle className="spin" size={15} /> : null}
                确认记录
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
  const [application, setApplication] = useState<Application | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [deliverablePurpose, setDeliverablePurpose] = useState("rirekisho");
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);
  const [packageLabel, setPackageLabel] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!applicationId) return;
    try {
      const data = await api.application(applicationId);
      setApplication(data.application);
      setDraft(data.draft);
      setSelectedStatus(data.application.status);
    } catch (error) {
      showToast({
        title: "申请加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setLoading(false);
    }
  }, [applicationId, showToast]);
  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (key: string, action: () => Promise<Response>) => {
    setBusy(key);
    try {
      await action();
      await load();
    } catch (error) {
      showToast({
        title: "操作失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取申请材料…</span>
      </div>
    );
  if (!application || !draft)
    return (
      <EmptyState
        description="找不到这份申请记录，可能已被移除。"
        title="申请不存在"
        action={
          <Button onClick={() => navigate("/applications")} variant="secondary">
            返回申请Kanban
          </Button>
        }
      />
    );

  const draftPaths = new Set(draft.files.map((file) => file.path));
  const hasSourceDocuments = documentNames.every(({ path }) =>
    draftPaths.has(path),
  );
  const hasDeliverables = draft.deliverable_files.length > 0;
  const hasMaterialPackage = application.packages.length > 0;
  const hasSubmissionRecord = application.submissions.length > 0;
  const canDeleteApplication =
    draft.revision === 0 &&
    draft.status === "empty" &&
    draft.files.length === 0 &&
    application.packages.length === 0 &&
    application.submissions.length === 0;
  const preparationSteps = [
    hasSourceDocuments,
    hasDeliverables,
    hasMaterialPackage,
    hasSubmissionRecord,
  ];
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
  const preparationStepState = (index: number, isComplete: boolean) =>
    isComplete
      ? "已完成"
      : currentPreparationStep === index
        ? "进行中"
        : "待进行";
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
      showToast({ title: "请选择 PDF 或 DOCX 文件" });
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
    if (!window.confirm("从当前材料中移除这个文件？")) return;
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
    if (!window.confirm("清空当前材料？既有材料包不会受影响。")) return;
    void mutate("discard", () =>
      postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/draft/discard`,
        { expected_revision: draft.revision },
      ),
    );
  };
  const deleteApplication = async () => {
    if (!canDeleteApplication || busy === "delete") return;
    if (
      !window.confirm(
        "删除后申请记录和空白草稿将永久移除。之后可以从已保存岗位重新创建。确定删除？",
      )
    )
      return;
    setBusy("delete");
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(application.id)}/delete`,
        {},
      );
      navigate("/applications");
    } catch (error) {
      showToast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "请稍后重试",
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
              label="复制申请ID和AI讨论"
              prompt={buildApplicationDiscussionPrompt(application.id)}
              successDescription="请粘贴到 Codex 中开始讨论。"
            />
            {application.job_url ? (
              <a
                className="button button-secondary"
                href={application.job_url}
                rel="noreferrer"
                target="_blank"
              >
                查看原始职位
                <ExternalLink size={15} />
              </a>
            ) : null}
            <Link className="button button-ghost" to="/applications">
              ← 返回Kanban
            </Link>
          </>
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <Panel className="workflow-card compact-workflow">
            <div className="section-heading">
              <div>
                <span className="page-eyebrow">当前阶段</span>
                <h2>申请阶段</h2>
              </div>
              <span>最后更新 {formatDate(application.updated_at, true)}</span>
            </div>
            <div className="status-update-row">
              <label className="field-label">
                <span className="sr-only">申请阶段</span>
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
                        {label}
                        {key === "applied" && application.status !== "applied"
                          ? "（由投递记录进入）"
                          : ""}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <input
                onChange={(event) => setStatusNote(event.target.value)}
                placeholder="阶段备注（可选）"
                value={statusNote}
              />
              <Button disabled={busy === "status"} onClick={updateStatus}>
                {busy === "status" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : null}
                更新阶段
              </Button>
            </div>
          </Panel>
          <Panel className="workflow-card preparation-card">
            <div className="section-heading preparation-heading">
              <div>
                <span className="page-eyebrow">申请准备清单</span>
                <h2>申请准备清单</h2>
                <p>按顺序完成四步，确保最终投递材料可追溯。</p>
              </div>
              <strong>{completedPreparationSteps} / 4 步骤</strong>
            </div>
            <div
              aria-label={`申请准备进度：${completedPreparationSteps} / 4 步骤`}
              aria-valuemax={4}
              aria-valuemin={0}
              aria-valuenow={completedPreparationSteps}
              className="preparation-progress"
              role="progressbar"
            >
              <span style={{ width: `${completedPreparationSteps * 25}%` }} />
            </div>
            <ol className="preparation-steps" aria-label="申请准备清单">
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
                      <h3>创建履歴書与職務経歴書</h3>
                      <p>维护内容源，或让 AI 根据职位和履历起草。</p>
                    </div>
                    <span className="step-state">
                      {preparationStepState(0, hasSourceDocuments)}
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
                                aria-label={`预览 ${title}`}
                                className="icon-action"
                                to={previewUrl(application.id, path)}
                              >
                                <FileText size={15} />
                              </Link>
                              <Link
                                aria-label={`编辑 ${title}`}
                                className="icon-action"
                                to={`/applications/${encodeURIComponent(application.id)}/draft/edit/${encodedPath(path)}`}
                              >
                                <Pencil size={15} />
                              </Link>
                              <a
                                aria-label={`下载 ${title}`}
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
                              <span>尚未创建</span>
                            </div>
                            <Plus size={16} />
                          </Link>
                        ),
                      )}
                    </div>
                    <div className="source-start">
                      <div className="source-start-copy">
                        <span>快捷方式</span>
                        <strong>让 AI 起草</strong>
                        <p>让 Codex 根据职位和履历生成初稿。</p>
                      </div>
                      <div className="source-start-actions">
                        <AiPromptButton
                          label="让 AI 起草"
                          prompt={aiPrompt}
                          successDescription="请粘贴到 Codex 中开始起草。"
                        />
                      </div>
                    </div>
                    <div className="step-footer-actions">
                      <span>当前 Revision {draft.revision}</span>
                      <Button
                        disabled={busy === "discard"}
                        onClick={discardDraft}
                        variant="ghost"
                      >
                        清空当前材料
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
                      <h3>上传实际投递文件</h3>
                      <p>上传你在外部排版后实际发送的 PDF 或 DOCX。</p>
                    </div>
                    <span className="step-state">
                      {preparationStepState(1, hasDeliverables)}
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
                        <div className="section-empty">尚未上传最终文件。</div>
                      )}
                    </div>
                    <form className="upload-form" onSubmit={uploadDeliverable}>
                      <div className="form-grid">
                        <label className="field-label">
                          <span>材料用途</span>
                          <select
                            onChange={(event) =>
                              setDeliverablePurpose(event.target.value)
                            }
                            value={deliverablePurpose}
                          >
                            <option value="rirekisho">履歴書</option>
                            <option value="shokumu_keirekisho">
                              职务经历书
                            </option>
                            <option value="employer_form">公司指定表格</option>
                            <option value="portfolio">作品集</option>
                            <option value="other">其他</option>
                          </select>
                        </label>
                        <div className="field-label">
                          <span>文件</span>
                          <label className="file-picker">
                            <Upload size={16} />
                            <span>
                              {deliverableFile?.name ?? "选择 PDF / DOCX"}
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
                        上传到当前材料
                      </Button>
                    </form>
                    <div className="external-format-note">
                      <div className="note-icon">
                        <ExternalLink size={16} />
                      </div>
                      <div>
                        <strong>在外部调整格式</strong>
                        <p>
                          下载 Markdown 后，可在 Google Docs、Word
                          或公司指定模板中调整内容与版式。完成后，将实际投递的
                          PDF 或 DOCX 上传到当前材料。
                        </p>
                        <p>
                          制作职务经历书时，也可以使用{" "}
                          <a
                            href="https://md-resume.jahom.dev/"
                            rel="noreferrer"
                            target="_blank"
                          >
                            Markdown Resume Studio
                          </a>{" "}
                          预览版式。
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
                      <h3>保存不可变材料包</h3>
                      <p>保存当前材料快照，之后可用于精确投递记录。</p>
                    </div>
                    <span className="step-state">
                      {preparationStepState(2, hasMaterialPackage)}
                    </span>
                  </div>
                  <div className="step-surface">
                    <div className="package-save-controls">
                      <label className="package-label-input">
                        <span>材料包标签（可选）</span>
                        <input
                          maxLength={120}
                          onChange={(event) =>
                            setPackageLabel(event.target.value)
                          }
                          placeholder="例如：SWE · 2026 春季版"
                          value={packageLabel}
                        />
                      </label>
                      <Button
                        disabled={busy === "package"}
                        onClick={lockPackage}
                        variant="secondary"
                      >
                        {busy === "package" ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <LockKeyhole size={15} />
                        )}
                        保存材料包
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
                        <span>材料包历史</span>
                        <span className="summary-count">
                          {application.packages.length}
                        </span>
                      </summary>
                      <div className="accordion-body">
                        <p className="field-hint">
                          材料包是某个时刻的不可变快照。通常无需手动创建；记录投递时会自动保存。被投递记录引用后不可删除。
                        </p>
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
                                        "删除后材料包会移入本地回收目录。确认删除？",
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
                          <div className="section-empty">还没有材料包。</div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </li>
              <li
                className={`preparation-step ${preparationStepClass(3, hasSubmissionRecord)}`}
                id="preparation-submission"
              >
                <div className="step-marker" aria-hidden="true">
                  {hasSubmissionRecord ? <Check size={14} /> : "4"}
                </div>
                <div className="step-content">
                  <div className="step-heading">
                    <div>
                      <h3>记录已完成的外部投递</h3>
                      <p>外部投递完成后，在这里留下可追溯记录。</p>
                    </div>
                    <span className="step-state">
                      {preparationStepState(3, hasSubmissionRecord)}
                    </span>
                  </div>
                  <div className="step-surface">
                    <div className="submission-action-row">
                      <p>
                        系统不会发送文件。记录时会把当前材料自动保存为不可变材料包，并绑定本次事实。
                      </p>
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
                                  {(
                                    {
                                      exact_files: "精确文件",
                                      source_only: "仅材料来源",
                                      status_only: "仅状态",
                                    } as Record<string, string>
                                  )[submission.evidence_level] ??
                                    submission.evidence_level}{" "}
                                  ·{" "}
                                  {(
                                    {
                                      company_portal: "公司招聘页",
                                      email: "邮件",
                                      recruiting_agent: "猎头 / 中介",
                                      linkedin: "LinkedIn",
                                      other: "其他",
                                    } as Record<string, string>
                                  )[submission.channel] ?? submission.channel}
                                </span>
                                <p>
                                  {submission.package_id ? (
                                    <>
                                      材料包{" "}
                                      <code>{submission.package_id}</code>
                                    </>
                                  ) : (
                                    "未绑定材料包"
                                  )}
                                  {submission.files.length
                                    ? ` · ${submission.files.length} 个已保存文件`
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
                        还没有投递记录。完成外部投递后，在这里留下可追溯记录。
                      </div>
                    )}
                  </div>
                </div>
              </li>
            </ol>
          </Panel>
          <section
            aria-labelledby="application-delete-heading"
            className="panel application-danger-zone"
          >
            <div className="danger-zone-heading">
              <div>
                <span className="page-eyebrow">危险操作</span>
                <h2 id="application-delete-heading">删除申请</h2>
                <p>
                  只允许删除尚未创建材料、材料包或投递记录的空申请。删除后可从已保存岗位重新开始。
                </p>
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
                删除申请
              </Button>
            </div>
            <p className="danger-zone-hint">
              {canDeleteApplication
                ? "当前申请是空壳，可以安全删除。"
                : "已有材料内容、材料包、投递记录或不可变修订历史，无法删除。"}
            </p>
          </section>
        </div>
        <aside className="activity-panel">
          <div className="activity-heading">
            <div>
              <span className="page-eyebrow">关键动作</span>
              <h2>活动记录</h2>
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
                  <summary>更早记录（{olderActivityEvents.length}）</summary>
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
            <div className="section-empty">暂无关键活动。</div>
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
          <strong>{item.label || "材料包"}</strong>
          <span>
            {formatDate(item.created_at, true)} · {item.files.length} 个文件
          </span>
        </div>
        {item.is_submitted ? (
          <StatusBadge label="已绑定投递 · 已锁定" tone="success" />
        ) : (
          <StatusBadge label="未绑定" tone="neutral" />
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
            可作为精确文件证据
          </span>
        ) : null}
        {!item.is_submitted ? (
          <>
            <Button onClick={onRestore} variant="ghost">
              <Archive size={14} />
              恢复到当前材料
            </Button>
            <Button
              onClick={onDelete}
              variant="ghost"
              className="danger-button"
            >
              <Trash2 size={14} />
              删除
            </Button>
          </>
        ) : (
          <span className="locked-note">
            <LockKeyhole size={14} />
            投递记录引用后永久保留
          </span>
        )}
      </div>
    </article>
  );
}

function eventLabel(
  type: string,
  data: Record<string, unknown>,
  labels: Record<string, string>,
): string {
  if (type === "status.changed")
    return `阶段更新为 ${labels[String(data.status)] ?? String(data.status ?? "未知")}`;
  if (type === "application.created") return "创建申请记录";
  if (type === "application.submitted") return "记录已投递";
  if (type === "draft.validated") return "更新材料检查结果";
  if (type === "draft.discarded") return "清空当前材料";
  if (type === "materials.packaged" || type === "materials.package-created")
    return "创建材料包";
  if (type === "materials.package-deleted") return "删除材料包";
  if (type === "draft.created" || type === "draft.updated")
    return "更新当前材料";
  return type;
}
