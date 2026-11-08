import type { ReactNode } from "react";
import { cn } from "./cn";

// Grey shimmering placeholder shaped like the content that's loading.
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("ps-skeleton block rounded-md", className)} />;
}

// Screen readers hear "Loading" once instead of a pile of shapes.
export function LoadingRegion({ label = "Loading", children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

// What to show when a list has nothing in it: what it is, and what to do next.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon && (
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted ring-1 ring-line">{icon}</span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// A coloured message box inside a page (not a toast).
export function Notice({
  tone = "accent",
  title,
  children,
  action,
  className,
}: {
  tone?: "accent" | "warn" | "loss" | "profit";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    accent: "border-accent/25 bg-accent-soft",
    warn: "border-warn/30 bg-warn-soft",
    loss: "border-loss/30 bg-loss-soft",
    profit: "border-profit/25 bg-profit-soft",
  };
  return (
    <div
      role={tone === "loss" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", tones[tone], className)}
    >
      <div className="min-w-0 text-ink-2">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
