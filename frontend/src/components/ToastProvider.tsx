import * as Toast from "@radix-ui/react-toast";
import { createContext, type ReactNode, useContext, useState } from "react";

type ToastState = {
  title: string;
  description?: string;
  tone?: "success";
} | null;
type ToastContextValue = {
  showToast: (toast: NonNullable<ToastState>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside AppShell");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);

  return (
    <Toast.Provider swipeDirection="right">
      <ToastContext.Provider value={{ showToast: setToast }}>
        {children}
        <Toast.Root
          className={`toast-root${toast?.tone ? ` is-${toast.tone}` : ""}`}
          duration={2400}
          onOpenChange={(open) => !open && setToast(null)}
          open={Boolean(toast)}
        >
          <div className="toast-content">
            <Toast.Title className="toast-title">{toast?.title}</Toast.Title>
            {toast?.description ? (
              <Toast.Description className="toast-description">
                {toast.description}
              </Toast.Description>
            ) : null}
          </div>
          <Toast.Close className="toast-close" aria-label="关闭提示">
            ×
          </Toast.Close>
        </Toast.Root>
        <Toast.Viewport className="toast-viewport" />
      </ToastContext.Provider>
    </Toast.Provider>
  );
}
