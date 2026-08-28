import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { useToast } from "./ToastProvider";

export function AiPromptButton({
  prompt,
  label,
  successDescription,
}: {
  prompt: string;
  label: string;
  successDescription: string;
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      showToast({
        title: "Prompt 已复制",
        description: successDescription,
        tone: "success",
      });
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, 2200);
    } catch {
      showToast({ title: "复制失败", description: "请检查浏览器剪贴板权限。" });
    }
  };

  return (
    <Button onClick={() => void copyPrompt()}>
      <Sparkles size={16} />
      {copied ? "已复制" : label}
    </Button>
  );
}
