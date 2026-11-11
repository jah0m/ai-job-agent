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
import { useI18n } from "../i18n";
import type { PackageCatalogItem } from "../types";

export function PackagesPage() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.packages;
  const [items, setItems] = useState<PackageCatalogItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems((await api.packages()).items);
    } catch (error) {
      showToast({
        title: m.loadFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetryLater,
      });
    }
  }, [showToast, m, t]);
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
        title: m.restoreFailed,
        description: error instanceof Error ? error.message : m.retryInDetail,
      });
    } finally {
      setBusy(null);
    }
  };
  if (!items)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={26} />
        <span>{m.loading}</span>
      </div>
    );
  return (
    <div className="packages-page">
      <PageIntro description={m.description} title={m.title} />
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
                  <h2>{item.label || m.fallbackLabel}</h2>
                  <p>{application.role}</p>
                </div>
                <StatusBadge
                  label={item.is_submitted ? m.locked : m.restorable}
                  tone={item.is_submitted ? "success" : "neutral"}
                />
              </div>
              <div className="catalog-meta">
                <span>{m.createdAt(formatDate(item.created_at, true))}</span>
                <span>{m.fileCount(item.files.length)}</span>
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
                      {m.exactEvidence}
                    </>
                  ) : item.readiness.ready_for_source_only ? (
                    m.sourceOnly
                  ) : (
                    m.checkIntegrity
                  )}
                </span>
                {item.is_submitted ? (
                  <span className="locked-note">
                    <LockKeyhole size={14} />
                    {m.keptForever}
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
                    {m.restore}
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState description={m.emptyHint} title={m.emptyTitle} />
        </Panel>
      )}
    </div>
  );
}
