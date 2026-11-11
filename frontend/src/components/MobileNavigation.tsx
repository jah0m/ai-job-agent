import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n";
import { Navigation } from "./Navigation";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <button
          className="mobile-menu-button icon-button"
          type="button"
          aria-label={t.shell.nav.open}
        >
          <Menu size={20} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-nav-overlay" />
        <Dialog.Content className="mobile-nav-panel">
          <div className="mobile-nav-heading">
            <Dialog.Title className="brand">
              <span className="brand-mark">J</span>
              <span>AI Job Agent</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                type="button"
                aria-label={t.shell.nav.close}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          <Navigation onNavigate={() => setOpen(false)} />
          <div className="local-status">
            <span className="status-dot" />
            <div>
              <strong>{t.shell.localFirst}</strong>
              <span>{t.shell.localOnly}</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
