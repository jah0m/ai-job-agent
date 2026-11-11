import * as Dialog from "@radix-ui/react-dialog";
import { Copy, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";
import { useToast } from "./ToastProvider";

export function AiPromptButton({
  prompt,
  label,
  successDescription,
  onCheck,
  className,
}: {
  prompt: string;
  label: string;
  successDescription: string;
  onCheck?: () => Promise<void>;
  className?: string;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const copyPrompt = async () => {
    setOpen(true);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // The dialog exposes the instruction for manual copying.
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      if (onCheck) {
        await onCheck();
        setOpen(false);
      } else window.location.reload();
    } catch (error) {
      showToast({
        title: "读取失败",
        description: error instanceof Error ? error.message : "请重试",
      });
    } finally {
      setChecking(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button className={className} onClick={() => void copyPrompt()}>
          <Copy size={15} />
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content ai-handoff-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>在 Codex 中继续</Dialog.Title>
              <Dialog.Description>
                网页负责显示和管理结果，AI 工作需要你在 Codex 中发起。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭交接说明"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <ol className="ai-handoff-steps">
            <li>
              <strong>{copied ? "指令已复制" : "复制指令"}</strong>
              <p>
                {copied
                  ? "剪贴板中已有本次指令，尚未启动 AI 任务。"
                  : "自动复制不可用，请展开下方指令并手动复制。"}
              </p>
            </li>
            <li>
              <strong>切换到 Codex 并发送</strong>
              <p>
                {successDescription} 等待 Codex
                回复；需要保存的数据，请按提示确认入库。
              </p>
            </li>
            <li>
              <strong>回到这里核对结果</strong>
              <p>
                搜索结果需导入、分析和材料需保存后才会显示。讨论类任务的回答留在
                Codex 中。
              </p>
            </li>
          </ol>
          <details open={!copied}>
            <summary>查看或手动复制指令</summary>
            <label className="field-label">
              <span className="sr-only">Codex 指令</span>
              <textarea
                readOnly
                value={prompt}
                rows={7}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          </details>
          <p className="field-hint">
            刷新只重新读取本地数据，不代表 AI 已完成。请核对最新内容和更新时间。
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => void copyPrompt()}>
              重新复制
            </Button>
            <Button disabled={checking} onClick={() => void check()}>
              {checking ? "读取中…" : "刷新查看结果"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
