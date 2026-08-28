import {
  ArrowLeft,
  Download,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Save,
} from "lucide-react";
import type { ElementType } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, postUrlEncoded } from "../api";
import {
  Button,
  EmptyState,
  PageIntro,
  Panel,
  useToast,
} from "../components/Layout";
import { formatDate } from "../format";
import type { DocumentPreview, MarkdownBlock } from "../types";

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function Block({ block }: { block: MarkdownBlock }) {
  if (block.kind === "heading") {
    const Heading: ElementType =
      `h${Math.min(Math.max(block.level, 1), 5)}` as ElementType;
    return <Heading>{block.text}</Heading>;
  }
  if (block.kind === "paragraph") return <p>{block.text}</p>;
  if (block.kind === "quote") return <blockquote>{block.text}</blockquote>;
  if (block.kind === "notice")
    return <div className="document-notice">{block.text}</div>;
  if (block.kind === "list")
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  if (block.kind === "table")
    return (
      <div className="document-table-wrap">
        <table>
          <thead>
            <tr>
              {block.headers.map((cell) => (
                <th key={cell}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={JSON.stringify(row)}>
                {row.map((cell) => (
                  <td key={`${cell}-${JSON.stringify(row)}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return null;
}

function documentDownload(
  preview: DocumentPreview,
  packageId?: string,
): string {
  const id = encodeURIComponent(preview.application.id);
  const path = encodedPath(preview.relative_path);
  return packageId
    ? `/applications/${id}/packages/${encodeURIComponent(packageId)}/files/${path}`
    : `/applications/${id}/draft/files/${path}`;
}

export function DocumentPreviewPage() {
  const { applicationId, packageId, "*": wildcard } = useParams();
  const [data, setData] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!applicationId || !wildcard) return;
    setData(null);
    setError(null);
    void (
      packageId
        ? api.packagePreview(applicationId, packageId, wildcard)
        : api.draftPreview(applicationId, wildcard)
    )
      .then(setData)
      .catch((requestError) => {
        const message =
          requestError instanceof Error ? requestError.message : "请稍后重试";
        setError(message);
      });
  }, [applicationId, packageId, wildcard]);
  if (error && applicationId)
    return (
      <EmptyState
        action={
          <Link
            className="button button-secondary"
            to={`/applications/${encodeURIComponent(applicationId)}`}
          >
            返回申请
          </Link>
        }
        description={error}
        title="无法读取这份文档"
      />
    );
  if (!data)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取文档…</span>
      </div>
    );
  const isWorkHistory = data.relative_path.endsWith("shokumu-keirekisho.md");
  return (
    <div className="document-page">
      <PageIntro
        description={`${data.application.company} · ${data.application.role}`}
        title={data.document_title}
        actions={
          <>
            <a
              className="button button-secondary"
              download
              href={documentDownload(data, packageId)}
            >
              <Download size={15} />
              下载 Markdown
            </a>
            {data.is_draft ? (
              <Link
                className="button button-primary"
                to={`/applications/${encodeURIComponent(data.application.id)}/draft/edit/${encodedPath(data.relative_path)}`}
              >
                <Pencil size={15} />
                编辑工作草稿
              </Link>
            ) : null}
          </>
        }
      />
      <div className="document-meta-row">
        <span>
          {data.is_draft
            ? `当前材料 · Revision ${data.draft?.revision ?? "—"}`
            : `${data.package?.label || "材料包"} · ${formatDate(data.package?.created_at, true)}`}
        </span>
        <Link to={`/applications/${encodeURIComponent(data.application.id)}`}>
          <ArrowLeft size={15} />
          返回申请
        </Link>
      </div>
      {isWorkHistory ? (
        <div className="converter-note">
          <div>
            <strong>需要导出 PDF？</strong>
            <p>
              下载 Markdown 后，可使用 Markdown Resume Studio 调整版式并导出
              PDF。
            </p>
          </div>
          <a
            href="https://md-resume.jahom.dev/"
            rel="noreferrer"
            target="_blank"
          >
            打开 Markdown Resume Studio <ExternalLink size={14} />
          </a>
        </div>
      ) : null}
      <Panel className="document-paper">
        <article
          className="document-content"
          aria-label={`${data.document_title}预览`}
        >
          {data.blocks.map((block) => (
            <Block block={block} key={JSON.stringify(block)} />
          ))}
        </article>
      </Panel>
    </div>
  );
}

export function DocumentEditPage() {
  const { applicationId, "*": wildcard } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!applicationId || !wildcard) return;
    setData(null);
    setError(null);
    void api
      .draftPreview(applicationId, wildcard)
      .then((result) => {
        setData(result);
        setContent(result.content);
        setLabel(result.draft?.label || `在线编辑 · ${result.document_title}`);
      })
      .catch((requestError) => {
        const message =
          requestError instanceof Error ? requestError.message : "请稍后重试";
        setError(message);
      });
  }, [applicationId, wildcard]);
  if (error && applicationId)
    return (
      <EmptyState
        action={
          <Link
            className="button button-secondary"
            to={`/applications/${encodeURIComponent(applicationId)}`}
          >
            返回申请
          </Link>
        }
        description={error}
        title="无法准备编辑器"
      />
    );
  if (!data || !applicationId)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在准备编辑器…</span>
      </div>
    );
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(applicationId)}/draft/edit/${encodedPath(data.relative_path)}`,
        { expected_revision: data.draft?.revision ?? 0, label, content },
      );
      navigate(`/applications/${encodeURIComponent(applicationId)}`);
    } catch (error) {
      showToast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="document-edit-page">
      <PageIntro
        description={`${data.application.company} · ${data.application.role}`}
        title={`编辑工作草稿 · ${data.document_title}`}
        actions={
          <Link
            className="button button-secondary"
            to={`/applications/${encodeURIComponent(applicationId)}`}
          >
            取消
          </Link>
        }
      />
      <div className="editor-note">
        <strong>这里只保存当前材料</strong>
        <span>
          保存不会覆盖既有材料包，也不会向雇主发送文件；记录投递时系统会自动保存不可变快照。
        </span>
      </div>
      <Panel className="markdown-editor">
        <form className="stack-form" onSubmit={save}>
          <label className="field-label">
            <span>草稿标签</span>
            <input
              maxLength={120}
              onChange={(event) => setLabel(event.target.value)}
              value={label}
            />
          </label>
          <label className="field-label editor-content-field">
            <span>Markdown 内容</span>
            <textarea
              onChange={(event) => setContent(event.target.value)}
              required
              spellCheck={false}
              value={content}
            />
          </label>
          <div className="editor-actions">
            <Link
              className="button button-secondary"
              to={`/applications/${encodeURIComponent(applicationId)}`}
            >
              取消
            </Link>
            <Button disabled={saving} type="submit">
              {saving ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Save size={15} />
              )}
              保存到工作草稿
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
