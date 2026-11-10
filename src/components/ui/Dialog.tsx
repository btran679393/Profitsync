"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { cn } from "./cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const subscribeNothing = () => () => {};

// Render into <body>, outside the page layout.
function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!mounted) return null;
  return createPortal(<div className="ps-app">{children}</div>, document.body);
}

// Dialogs currently open, oldest first.
const openDialogs: object[] = [];

// Shared behaviour for modals and drawers: Escape closes, Tab stays inside,
// the page behind can't scroll, and focus goes back where it was on close.
function useDialogBehaviour(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const token = {};
    openDialogs.push(token);

    function onKey(event: KeyboardEvent) {
      // With a dialog open on top of another (e.g. "Discard changes?" over
      // the order panel), only the top one reacts to keys.
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return panelRef;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

// Centered dialog.
// A bare dialog near the top of the screen with no header (the quick-jump
// search box). Same focus, Escape and stacking rules as Modal.
export function CommandDialog({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const panelRef = useDialogBehaviour(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh] sm:px-4">
        <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="animate-ps-in relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop outline-none"
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: DialogProps) {
  const panelRef = useDialogBehaviour(open, onClose);
  const titleId = useId();
  const descId = useId();
  if (!open) return null;
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className={cn(
            "animate-ps-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-elevated shadow-pop outline-none sm:rounded-2xl",
            width
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
              {description && <p id={descId} className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <CloseButton onClose={onClose} />
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

// Panel that slides in from the right (full screen on phones).
export function Drawer({ open, onClose, title, description, children, footer, size = "md" }: DialogProps) {
  const panelRef = useDialogBehaviour(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl";
  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex justify-end">
        <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn("animate-ps-drawer relative flex h-full w-full flex-col border-l border-line bg-elevated shadow-pop outline-none", width)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
              {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

// ------------------------------------------------------------
// Confirm dialog: `const confirm = useConfirm(); if (await confirm({...}))`
// ------------------------------------------------------------

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    []
  );

  function finish(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={request !== null}
        onClose={() => finish(false)}
        title={request?.title ?? ""}
        size="sm"
        footer={
          <>
            {/* Risky actions start on Cancel, so Enter can't delete by accident. */}
            <Button variant="secondary" onClick={() => finish(false)} data-autofocus={request?.danger ? true : undefined}>
              {request?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={request?.danger ? "danger" : "primary"}
              onClick={() => finish(true)}
              data-autofocus={request?.danger ? undefined : true}
            >
              {request?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        {request?.description && <div className="text-sm leading-6 text-ink-2">{request.description}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
