import { useState } from "react";
import { postUrlEncoded } from "../api";
import { useI18n } from "../i18n";
import type { NextAction } from "../types";
import { Button, Panel, useToast } from "./Layout";

export function NextActionEditor({
  applicationId,
  action,
  onDone,
}: {
  applicationId: string;
  action: NextAction;
  onDone: () => Promise<void>;
}) {
  const [title, setTitle] = useState(action.title);
  const [dueDate, setDueDate] = useState(action.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const { t } = useI18n();
  const m = t.workflow.nextAction;
  const changed = title !== action.title || dueDate !== (action.due_date ?? "");
  const update = async (operation: string) => {
    if (
      operation === "clear" &&
      !window.confirm(changed ? m.confirmClearDirty : m.confirmClear)
    )
      return;
    setBusy(true);
    try {
      await postUrlEncoded(
        `/applications/${encodeURIComponent(applicationId)}/next-action`,
        {
          operation,
          title,
          due_date: dueDate,
          expected_revision: action.revision,
        },
      );
      await onDone();
      showToast({ title: m.updated, tone: "success" });
    } catch (error) {
      showToast({
        title: m.updateFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetry,
      });
      // Re-read so a stale revision cannot keep failing; the parent remounts
      // this editor only when the stored action actually changed.
      await onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="workflow-card next-action-card">
      <div className="section-heading">
        <div>
          <span className="page-eyebrow">{m.eyebrow}</span>
          <h2>{m.heading}</h2>
        </div>
        {action.completed_at ? (
          <span className="action-completed">{m.completed}</span>
        ) : null}
      </div>
      <p className="field-hint">{m.intro}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void update("save");
        }}
      >
        <fieldset disabled={busy} className="next-action-fields">
          <label className="field-label">
            <span>{m.titleLabel}</span>
            <input
              required
              maxLength={240}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={m.titlePlaceholder}
            />
          </label>
          <label className="field-label">
            <span>{m.dueLabel}</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <div className="next-action-buttons">
            <Button type="submit" disabled={!title.trim()}>
              {busy
                ? t.common.saving
                : action.completed_at
                  ? m.saveAsNew
                  : m.save}
            </Button>
            {action.title ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={changed}
                  onClick={() =>
                    void update(action.completed_at ? "reopen" : "complete")
                  }
                >
                  {action.completed_at ? m.reopen : m.complete}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void update("clear")}
                >
                  {m.clear}
                </Button>
              </>
            ) : null}
          </div>
        </fieldset>
      </form>
      <p className="field-hint">{m.footer}</p>
    </Panel>
  );
}
