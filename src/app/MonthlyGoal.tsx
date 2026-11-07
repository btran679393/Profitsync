"use client";

import { useState } from "react";

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
      <span className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          placeholder="500"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Monthly profit goal"
          className={`w-28 rounded-xl border bg-[#0b1120] py-2 pl-6 pr-2 text-white outline-none focus:border-blue-500 ${valid ? "border-white/10" : "border-rose-500/60"}`}
        />
      </span>
      <button type="submit" disabled={!valid || saving} className="rounded-xl bg-blue-600 px-3 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
        {saving ? "Saving…" : "Save goal"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="px-2 text-slate-500 hover:text-slate-300">
        Cancel
      </button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </form>
  );

  const startEditing = () => {
    setDraft(goal === null ? "" : String(goal));
    setError("");
    setEditing(true);
  };

  if (goal === null || goal <= 0) {
    return (
      <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-dashed border-white/10 bg-[#151d2d] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Set a monthly profit goal</h3>
          <p className="mt-1 text-xs text-slate-500">
            You&apos;ve made {money(profit)} profit so far in {monthName}. A goal shows whether you&apos;re on track.
          </p>
        </div>
        {editing ? editor : (
          <button type="button" onClick={startEditing} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">
            Set goal
          </button>
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
    <section className="mt-6 rounded-2xl border border-white/[0.07] bg-[#151d2d] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{monthName} profit goal</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {money(profit)} <span className="text-base font-medium text-slate-500">of {money(goal)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              reached
                ? "bg-emerald-500/15 text-emerald-300"
                : onTrack
                  ? "bg-blue-500/15 text-blue-300"
                  : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {reached ? "Goal reached 🎉" : onTrack ? "On track" : "Behind pace"}
          </span>
          {!editing && (
            <button type="button" onClick={startEditing} className="text-xs font-semibold text-slate-400 hover:text-white">
              Edit
            </button>
          )}
        </div>
      </div>

      {editing && <div className="mt-3">{editor}</div>}

      <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all duration-700 ${reached ? "bg-emerald-400" : onTrack ? "bg-blue-500" : "bg-amber-400"}`}
          style={{ width: `${progress * 100}%` }}
        />
        {/* Where you'd be if profit came in evenly through the month */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/40"
          style={{ left: `${Math.min(100, (expected / goal) * 100)}%` }}
          title={`Pace for today: ${money(expected)}`}
        />
      </div>

      <p className="mt-3 text-xs text-slate-400">
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
