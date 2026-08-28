import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "primary",
  type = "button",
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}
