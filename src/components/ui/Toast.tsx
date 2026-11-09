"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
// An optional button in the toast, e.g. "Reconnect".
export type ToastAction = { label: string; href?: string; onClick?: () => void };
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string; action?: ToastAction };
type ToastApi = {
  success: (title: string, description?: string, action?: ToastAction) => void;
  error: (title: string, description?: string, action?: ToastAction) => void;
  info: (title: string, description?: string, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {}, info: () => {} });

const ICONS: Record<ToastTone, ReactNode> = {
  success: <path d="M5 12l4 4L19 6" />,
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
};

// One place for every "Saved" / "Something went wrong" message: bottom
// right on desktop, bottom of the screen on phones. Errors stay longer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string, action?: ToastAction) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, tone, title, description, action }]);
      // Toasts with a button stay longer so there's time to use it.
      window.setTimeout(() => dismiss(id), action ? 20000 : tone === "error" ? 9000 : 4500);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description, action) => push("success", title, description, action),
      error: (title, description, action) => push("error", title, description, action),
      info: (title, description, action) => push("info", title, description, action),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96"
      >
        {items.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className="animate-ps-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-elevated px-4 py-3 shadow-pop"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={cn(
                "mt-0.5 shrink-0",
                toast.tone === "success" ? "text-profit" : toast.tone === "error" ? "text-loss" : "text-accent-ink"
              )}
            >
              {ICONS[toast.tone]}
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs leading-5 text-muted">{toast.description}</p>}
              {toast.action &&
                (toast.action.href ? (
                  <a
                    href={toast.action.href}
                    className="mt-2 inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover"
                  >
                    {toast.action.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick?.();
                      dismiss(toast.id);
                    }}
                    className="mt-2 inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent hover:bg-accent-hover"
                  >
                    {toast.action.label}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
