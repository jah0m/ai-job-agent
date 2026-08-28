import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  as: Element = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Element className={`panel ${className}`}>{children}</Element>;
}
