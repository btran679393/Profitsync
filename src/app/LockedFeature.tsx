"use client";

import type { ReactNode } from "react";
import { Button, Card } from "@/components/ui";

// Shown in place of a feature the seller's plan doesn't include: what it
// does, which plan has it, and a button to the plans.
export default function LockedFeature({
  title,
  plan,
  children,
  points = [],
  onUpgrade,
  compact = false,
}: {
  title: string;
  plan: "Pro" | "Ultimate";
  children: ReactNode;
  points?: string[];
  onUpgrade: () => void;
  // A smaller box for inside another page.
  compact?: boolean;
}) {
  return (
    <Card className={compact ? "p-4" : "p-6 sm:p-8"}>
      <div className={compact ? "flex flex-wrap items-center justify-between gap-3" : "mx-auto max-w-xl text-center"}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-ink">Part of {plan === "Pro" ? "Pro and Ultimate" : "Ultimate"}</p>
          <h3 className={compact ? "mt-1 text-sm font-semibold text-ink" : "mt-2 text-lg font-semibold text-ink"}>{title}</h3>
          <div className={compact ? "mt-1 text-xs text-muted" : "mt-2 text-sm text-muted"}>{children}</div>
          {!compact && points.length > 0 && (
            <ul className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-sm text-ink-2">
              {points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="text-profit" aria-hidden="true">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button variant="primary" size={compact ? "sm" : "md"} onClick={onUpgrade} className={compact ? "" : "mt-5"}>
          See plans
        </Button>
      </div>
    </Card>
  );
}
