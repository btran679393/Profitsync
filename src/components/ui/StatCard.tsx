import type { ReactNode } from "react";
import { cn } from "./cn";
import { Skeleton } from "./Feedback";

export type Trend = { value: number; label?: string; goodWhenUp?: boolean } | null;

// A headline number with a label, an optional icon, a short note and how it
// changed versus the previous period.
export function StatCard({
  label,
  value,
  note,
  icon,
  trend,
  tone = "neutral",
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  trend?: Trend;
  tone?: "neutral" | "profit" | "loss";
  loading?: boolean;
  className?: string;
}) {
  const good = trend ? (trend.goodWhenUp === false ? trend.value < 0 : trend.value > 0) : false;
  const flat = trend ? Math.abs(trend.value) < 0.05 : true;
  return (
    <section className={cn("relative rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p
          className={cn(
            "ps-num mt-2 text-2xl font-semibold tracking-tight",
            tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ink"
          )}
        >
          {value}
        </p>
      )}
      <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {trend && !loading && (
          <span
            className={cn(
              "ps-num inline-flex items-center gap-0.5 font-semibold",
              flat ? "text-subtle" : good ? "text-profit" : "text-loss"
            )}
          >
            {flat ? "→" : trend.value > 0 ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
            {trend.label && <span className="font-normal text-subtle">&nbsp;{trend.label}</span>}
          </span>
        )}
        {note && <span className="text-subtle">{note}</span>}
      </div>
    </section>
  );
}
