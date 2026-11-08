import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "accent" | "profit" | "loss" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted ring-line",
  accent: "bg-accent-soft text-accent-ink ring-accent/20",
  profit: "bg-profit-soft text-profit ring-profit/20",
  loss: "bg-loss-soft text-loss ring-loss/20",
  warn: "bg-warn-soft text-warn ring-warn/20",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        TONES[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
