import { useState } from "react";
import { postUrlEncoded } from "../api";
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
  const changed = title !== action.title || dueDate !== (action.due_date ?? "");
  const update = async (operation: string) => {
    if (
      operation === "clear" &&
      !window.confirm(
        changed
          ? "清除当前待办？未保存的修改也会丢失。"
          : "清除当前待办？变更会保留在活动记录中。",
      )
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
      showToast({ title: "待办已更新", tone: "success" });
    } catch (error) {
      showToast({
        title: "待办更新失败",
        description: error instanceof Error ? error.message : "请重试",
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
          <span className="page-eyebrow">下一步行动</span>
          <h2>接下来要做什么？</h2>
        </div>
        {action.completed_at ? (
          <span className="action-completed">已完成</span>
        ) : null}
      </div>
      <p className="field-hint">
        设置一个具体行动；到期日可选，按本机日期在首页归类。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void update("save");
        }}
      >
        <fieldset disabled={busy} className="next-action-fields">
          <label className="field-label">
            <span>行动内容</span>
            <input
              required
              maxLength={240}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：联系中介确认面试时间"
            />
          </label>
          <label className="field-label">
            <span>到期日（可选）</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <div className="next-action-buttons">
            <Button type="submit" disabled={!title.trim()}>
              {busy
                ? "保存中…"
                : action.completed_at
                  ? "保存为新待办"
                  : "保存待办"}
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
                  {action.completed_at ? "重新打开" : "标记完成"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void update("clear")}
                >
                  清除待办
                </Button>
              </>
            ) : null}
          </div>
        </fieldset>
      </form>
      <p className="field-hint">
        延期请修改到期日后保存。完成待办不会改变申请阶段；变更会保留在活动记录中。
      </p>
    </Panel>
  );
}
