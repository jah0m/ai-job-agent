import {
  Archive,
  Check,
  FileStack,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
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
import { fileName, formatDate } from "../format";
import type { PackageCatalogItem } from "../types";

export function PackagesPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PackageCatalogItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems((await api.packages()).items);
    } catch (error) {
      showToast({
        title: "材料包加载失败",
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    }
  }, [showToast]);
  useEffect(() => {
    void load();
  }, [load]);
  const restore = async (item: PackageCatalogItem) => {
    setBusy(item.package.id);
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(item.application.id)}/packages/${encodeURIComponent(item.package.id)}/restore`,
        { expected_revision: item.package.source_draft_revision ?? 0 },
      );
      await load();
    } catch (error) {
      showToast({
        title: "恢复失败",
        description:
          error instanceof Error ? error.message : "请在申请详情中重试",
      });
    } finally {
      setBusy(null);
    }
  };
  if (!items)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>正在读取材料包…</span>
      </div>
    );
  return (
    <div className="packages-page">
      <PageIntro
        description="不可变快照用于记录实际投递时使用的材料。"
        title="材料包"
      />
      {items.length ? (
        <div className="catalog-grid">
          {items.map(({ application, package: item }) => (
            <Panel
              className="catalog-card"
              key={`${application.id}-${item.id}`}
            >
              <div className="catalog-card-heading">
                <div className="package-icon">
                  <FileStack size={18} />
                </div>
                <div>
                  <span className="page-eyebrow">{application.company}</span>
                  <h2>{item.label || "材料包"}</h2>
                  <p>{application.role}</p>
                </div>
                <StatusBadge
                  label={item.is_submitted ? "已锁定" : "可恢复"}
                  tone={item.is_submitted ? "success" : "neutral"}
                />
              </div>
              <div className="catalog-meta">
                <span>创建于 {formatDate(item.created_at, true)}</span>
                <span>{item.files.length} 个文件</span>
              </div>
              <div className="catalog-files">
                {item.files.map((file) => {
                  const isMarkdown = file.path.endsWith(".md");
                  const isPdf = file.path.toLowerCase().endsWith(".pdf");
                  const href = isMarkdown
                    ? `/applications/${encodeURIComponent(application.id)}/packages/${encodeURIComponent(item.id)}/preview/${file.path.split("/").map(encodeURIComponent).join("/")}`
                    : `/applications/${encodeURIComponent(application.id)}/packages/${encodeURIComponent(item.id)}/files/${file.path.split("/").map(encodeURIComponent).join("/")}`;
                  return (
                    <Link
                      key={file.path}
                      rel={isPdf ? "noreferrer" : undefined}
                      reloadDocument={!isMarkdown}
                      target={isPdf ? "_blank" : undefined}
                      to={href}
                    >
                      <span className="catalog-file-icon">
                        <FileStack size={14} />
                      </span>
                      {fileName(file.path)}
                      <span className="file-extension">
                        {file.path.split(".").at(-1)?.toUpperCase()}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="catalog-foot">
                <span>
                  {item.readiness.ready_for_exact_files ? (
                    <>
                      <Check size={14} />
                      可作为精确文件证据
                    </>
                  ) : item.readiness.ready_for_source_only ? (
                    "可作为材料来源"
                  ) : (
                    "需检查完整性"
                  )}
                </span>
                {item.is_submitted ? (
                  <span className="locked-note">
                    <LockKeyhole size={14} />
                    投递记录引用后永久保留
                  </span>
                ) : (
                  <Button
                    disabled={busy === item.id}
                    onClick={() => void restore({ application, package: item })}
                    variant="secondary"
                  >
                    {busy === item.id ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <Archive size={14} />
                    )}
                    恢复到当前材料
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState
            description="在申请详情中保存一次当前材料后，材料包会出现在这里。"
            title="还没有材料包"
          />
        </Panel>
      )}
    </div>
  );
}
