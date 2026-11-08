"use client";

import { Button, Card, cn } from "@/components/ui";
import { Icon } from "./Icon";

export type SetupStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  action: { label: string; onClick?: () => void; href?: string };
};

// "Get started" for new sellers: the real steps that make ProfitSync's
// numbers right, ticked off automatically as they're done.
export default function SetupChecklist({
  steps,
  onHide,
  onOpenGuide,
}: {
  steps: SetupStep[];
  onHide: () => void;
  onOpenGuide: () => void;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextId = steps.find((s) => !s.done)?.id;
  const progress = (doneCount / steps.length) * 100;

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{allDone ? "You're all set" : "Get started with ProfitSync"}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {allDone
              ? "Your numbers are complete. You can hide this checklist."
              : "A few steps so your profit numbers are right. Each one ticks itself off when it's done."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenGuide} icon={<Icon name="info" size={14} />}>
            Read the guide
          </Button>
          <Button variant={allDone ? "secondary" : "ghost"} size="sm" onClick={onHide}>
            {allDone ? "Hide" : "Hide for now"}
          </Button>
        </div>
      </div>

      <div className="px-5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            <span className="ps-num font-semibold text-ink">{doneCount}</span> of {steps.length} done
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-label="Setup progress"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <ol className="mt-3 divide-y divide-line border-t border-line">
        {steps.map((step, index) => {
          const isNext = step.id === nextId;
          return (
            <li key={step.id} className={cn("flex items-start gap-3 px-5 py-3.5", isNext && "bg-accent-soft/60")}>
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step.done ? "bg-profit text-on-accent" : isNext ? "bg-accent text-on-accent" : "bg-surface-2 text-subtle ring-1 ring-line"
                )}
                aria-hidden="true"
              >
                {step.done ? <Icon name="check" size={14} /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", step.done ? "text-muted line-through decoration-line-strong" : "text-ink")}>
                  {step.title}
                  <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                </p>
                {!step.done && <p className="mt-0.5 text-xs leading-5 text-muted">{step.description}</p>}
              </div>
              {!step.done &&
                (step.action.href ? (
                  <a
                    href={step.action.href}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-semibold transition-colors",
                      isNext ? "bg-accent text-on-accent hover:bg-accent-hover" : "border border-line-strong text-ink hover:bg-surface-2"
                    )}
                  >
                    {step.action.label}
                  </a>
                ) : (
                  <Button size="sm" variant={isNext ? "primary" : "secondary"} onClick={step.action.onClick}>
                    {step.action.label}
                  </Button>
                ))}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
