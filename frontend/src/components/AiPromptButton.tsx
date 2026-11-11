import * as Dialog from "@radix-ui/react-dialog";
import { Copy, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  const m = t.workflow.handoff;
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
        title: m.readFailed,
        description:
          error instanceof Error ? error.message : t.common.pleaseRetry,
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
              <Dialog.Title>{m.title}</Dialog.Title>
              <Dialog.Description>{m.description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label={m.close}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <ol className="ai-handoff-steps">
            <li>
              <strong>{copied ? m.copied : m.copy}</strong>
              <p>{copied ? m.copiedHint : m.copyFailedHint}</p>
            </li>
            <li>
              <strong>{m.sendTitle}</strong>
              <p>
                {successDescription} {m.sendHint}
              </p>
            </li>
            <li>
              <strong>{m.checkTitle}</strong>
              <p>{m.checkHint}</p>
            </li>
          </ol>
          <details open={!copied}>
            <summary>{m.showPrompt}</summary>
            <label className="field-label">
              <span className="sr-only">{m.promptLabel}</span>
              <textarea
                readOnly
                value={prompt}
                rows={7}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          </details>
          <p className="field-hint">{m.refreshNote}</p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => void copyPrompt()}>
              {m.copyAgain}
            </Button>
            <Button disabled={checking} onClick={() => void check()}>
              {checking ? t.common.loading : m.refresh}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
