"use client";

import { useState } from "react";
import { Badge, Button, MoneyInput } from "@/components/ui";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

// "This month's profit goal": progress so far, the pace needed, and where the
// month is heading at the current rate. Set or change the goal inline.
export default function MonthlyGoal({
  goal,
  profit,
  sales,
  dayOfMonth,
  daysInMonth,
  monthName,
  onSave,
}: {
  goal: number | null;
  profit: number; // profit so far this month (after refunds and expenses)
  sales: number;
  dayOfMonth: number;
  daysInMonth: number;
  monthName: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const valid = draft.trim() === "" || /^\d+(\.\d{1,2})?$/.test(draft.trim());

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the goal.");
    } finally {
      setSaving(false);
    }
  }

  const editor = (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-28">
        <MoneyInput
          autoFocus
          value={draft}
          placeholder="500"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Monthly profit goal"
          aria-invalid={!valid}
        />
      </span>
      <Button type="submit" variant="primary" disabled={!valid} loading={saving}>
        Save goal
      </Button>
      <Button variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </form>
  );

  const startEditing = () => {
    setDraft(goal === null ? "" : String(goal));
    setError("");
    setEditing(true);
  };

  if (goal === null || goal <= 0) {
    return (
      <section className="flex flex-col gap-4 rounded-xl border border-dashed border-line-strong bg-surface p-5">
        <div>
          <h3 className="text-sm font-semibold text-ink">Set a monthly profit goal</h3>
          <p className="mt-1 text-xs text-muted">
            You&apos;ve made {money(profit)} profit so far in {monthName}. A goal shows whether you&apos;re on track.
          </p>
        </div>
        {editing ? editor : (
          <Button variant="secondary" onClick={startEditing} className="self-start">
            Set goal
          </Button>
        )}
      </section>
    );
  }

  const progress = Math.max(0, Math.min(1, profit / goal));
  const expected = goal * (dayOfMonth / daysInMonth);
  const projected = dayOfMonth > 0 ? (profit / dayOfMonth) * daysInMonth : 0;
  const reached = profit >= goal;
  const onTrack = reached || profit >= expected;
  const remainingDays = daysInMonth - dayOfMonth;
  const perDayNeeded = remainingDays > 0 ? Math.max(0, goal - profit) / remainingDays : 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">{monthName} profit goal</p>
          <p className="ps-num mt-1 text-2xl font-semibold tracking-tight text-ink">
            {money(profit)} <span className="text-sm font-medium text-subtle">of {money(goal)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={reached ? "profit" : onTrack ? "accent" : "warn"}>
            {reached ? "Goal reached" : onTrack ? "On track" : "Behind pace"}
          </Badge>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={startEditing}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {editing && <div className="mt-3">{editor}</div>}

      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${reached ? "bg-profit" : onTrack ? "bg-accent" : "bg-warn"}`}
          style={{ width: `${progress * 100}%` }}
        />
        {/* Where you'd be if profit came in evenly through the month */}
        <div
          className="absolute top-0 h-full w-0.5 bg-ink/40"
          style={{ left: `${Math.min(100, (expected / goal) * 100)}%` }}
          title={`Pace for today: ${money(expected)}`}
        />
      </div>

      <p className="ps-num mt-3 text-xs text-muted">
        {sales} sale{sales === 1 ? "" : "s"} so far · day {dayOfMonth} of {daysInMonth}
        {reached
          ? ` · ${money(profit - goal)} over your goal`
          : remainingDays > 0
            ? ` · about ${money(perDayNeeded)}/day needed · heading for ${money(projected)}`
            : ""}
      </p>
    </section>
  );
}
