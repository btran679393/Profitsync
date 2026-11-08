"use client";

import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, MAX_CATEGORY_LENGTH } from "@/lib/expenses";
import { useConfirm } from "@/components/ui";

// An expense as saved.
export type Expense = {
  id: number;
  ebayUserId: string | null;
  spentOn: string; // YYYY-MM-DD (first date, for a repeating expense)
  category: string;
  amount: string | number;
  note: string | null;
  repeatMonthly?: boolean;
  endedOn?: string | null;
};

// One line in the list: a one-off expense, or one month of a repeating one.
export type ExpenseEntry = Expense & {
  key: string;
  date: string; // YYYY-MM-DD this entry counts on
};

export type NewExpense = {
  spentOn: string;
  category: string;
  amount: string;
  note: string;
  wholeBusiness: boolean;
  repeatMonthly: boolean;
};

export type ExpenseChanges = Partial<{
  spentOn: string;
  category: string;
  amount: string;
  note: string;
  repeatMonthly: boolean;
  endedOn: string | null;
}>;

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function todayKey() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function prettyDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CUSTOM = "__custom__";
const field =
  "rounded-xl border border-white/10 bg-[#0b1120] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500";

export default function ExpensesSection({
  expenses,
  categories,
  enabled,
  loading,
  periodLabel,
  showWholeBusiness,
  canRepeat,
  onAdd,
  onUpdate,
  onDelete,
}: {
  expenses: ExpenseEntry[]; // already filtered to the chosen date range
  categories: string[]; // every category the seller has used (for suggestions)
  enabled: boolean;
  loading: boolean;
  periodLabel: string;
  showWholeBusiness: boolean;
  canRepeat: boolean;
  onAdd: (expense: NewExpense) => Promise<void>;
  onUpdate: (id: number, changes: ExpenseChanges) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [spentOn, setSpentOn] = useState(todayKey);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [wholeBusiness, setWholeBusiness] = useState(false);
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const confirm = useConfirm();

  // Suggested categories first, then the seller's own.
  const options = useMemo(() => {
    const own = categories.filter((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c)).sort((a, b) => a.localeCompare(b));
    return [...EXPENSE_CATEGORIES, ...own];
  }, [categories]);

  const chosenCategory = category === CUSTOM ? customCategory.trim() : category;
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.trim());
  const categoryValid = chosenCategory.length > 0 && chosenCategory.length <= MAX_CATEGORY_LENGTH;

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return expenses.filter((expense) => {
      if (categoryFilter && expense.category !== categoryFilter) return false;
      if (words.length === 0) return true;
      const haystack = [
        expense.category,
        expense.note ?? "",
        Number(expense.amount).toFixed(2),
        prettyDate(expense.date),
        expense.repeatMonthly ? "monthly repeating" : "",
      ]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [expenses, search, categoryFilter]);

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount));
    }
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const periodTotal = byCategory.reduce((sum, [, value]) => sum + value, 0);
  const shownTotal = shown.reduce((sum, e) => sum + Number(e.amount), 0);
  const filtering = Boolean(search.trim() || categoryFilter);

  function resetForm() {
    setEditing(null);
    setSpentOn(todayKey());
    setCategory(EXPENSE_CATEGORIES[0]);
    setCustomCategory("");
    setAmount("");
    setNote("");
    setRepeatMonthly(false);
  }

  function startEdit(expense: Expense) {
    setEditing(expense);
    setSpentOn(expense.spentOn);
    if (options.includes(expense.category)) {
      setCategory(expense.category);
      setCustomCategory("");
    } else {
      setCategory(CUSTOM);
      setCustomCategory(expense.category);
    }
    setAmount(Number(expense.amount).toFixed(2));
    setNote(expense.note ?? "");
    setRepeatMonthly(Boolean(expense.repeatMonthly));
    setMessage("");
    setState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!amountValid || !categoryValid) return;
    setState("saving");
    setMessage("");
    try {
      if (editing) {
        await onUpdate(editing.id, {
          spentOn,
          category: chosenCategory,
          amount: amount.trim(),
          note,
          ...(canRepeat ? { repeatMonthly } : {}),
        });
        setMessage("Changes saved.");
      } else {
        await onAdd({ spentOn, category: chosenCategory, amount: amount.trim(), note, wholeBusiness, repeatMonthly });
        setMessage(repeatMonthly ? "Monthly expense added." : "Expense added.");
      }
      resetForm();
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't save the expense.");
    }
  }

  async function remove(expense: ExpenseEntry) {
    const ok = await confirm(
      expense.repeatMonthly
        ? {
            title: `Delete the monthly ${expense.category.toLowerCase()} expense?`,
            description: 'This removes it from every month it counted in. To keep past months and only stop it from now on, choose "Stop" instead.',
            confirmLabel: "Delete",
            danger: true,
          }
        : {
            title: `Delete this ${money(Number(expense.amount))} expense?`,
            description: `${expense.category}${expense.note ? ` · ${expense.note}` : ""}`,
            confirmLabel: "Delete",
            danger: true,
          }
    );
    if (!ok) return;
    setBusyId(expense.id);
    try {
      await onDelete(expense.id);
      if (editing?.id === expense.id) resetForm();
    } finally {
      setBusyId(null);
    }
  }

  async function stopRepeating(expense: ExpenseEntry) {
    const ok = await confirm({
      title: `Stop the monthly ${expense.category.toLowerCase()} expense?`,
      description: "It won't count from today on. Past months stay counted.",
      confirmLabel: "Stop repeating",
    });
    if (!ok) return;
    setBusyId(expense.id);
    try {
      await onUpdate(expense.id, { endedOn: todayKey() });
    } finally {
      setBusyId(null);
    }
  }

  if (!enabled && !loading) {
    return (
      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-6 text-sm text-amber-200">
        Expenses need a one-time database update first. Run <code className="text-amber-100">docs/sql/2026-11-07_expenses.sql</code> in
        Supabase → SQL Editor, then refresh this page.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add or edit an expense */}
      <section className={`rounded-2xl border bg-[#151d2d] p-6 ${editing ? "border-blue-500/40" : "border-white/[0.07]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">{editing ? "Edit expense" : "Add an expense"}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {editing
                ? editing.repeatMonthly
                  ? "Changes apply to every month of this repeating expense."
                  : "Change any detail, then save."
                : "Costs that aren't tied to one sale. They're subtracted from your Net Profit."}
            </p>
          </div>
          {editing && (
            <button type="button" onClick={resetForm} className="text-xs font-semibold text-slate-400 hover:text-white">
              Cancel editing
            </button>
          )}
        </div>
        <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[150px_210px_130px_minmax(12rem,1fr)_auto]">
          <label className="text-xs text-slate-400">
            {repeatMonthly ? "First date" : "Date"}
            <input type="date" required value={spentOn} max={todayKey()} onChange={(e) => setSpentOn(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          <label className="text-xs text-slate-400">
            Category
            {category === CUSTOM ? (
              <span className="relative mt-1 block">
                <input
                  autoFocus
                  value={customCategory}
                  maxLength={MAX_CATEGORY_LENGTH}
                  placeholder="e.g. Storage unit"
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className={`w-full pr-8 ${field}`}
                  aria-label="Your own category"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCategory(EXPENSE_CATEGORIES[0]);
                    setCustomCategory("");
                  }}
                  aria-label="Choose from the list instead"
                  title="Choose from the list instead"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-slate-500 hover:text-white"
                >
                  ✕
                </button>
              </span>
            ) : (
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 w-full ${field}`}>
                {options.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={CUSTOM}>+ Your own category…</option>
              </select>
            )}
          </label>
          <label className="text-xs text-slate-400">
            Amount
            <span className="relative mt-1 block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input
                inputMode="decimal"
                required
                value={amount}
                placeholder="12.50"
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full pl-6 ${field} ${amount && !amountValid ? "border-rose-500/60" : ""}`}
              />
            </span>
          </label>
          <label className="text-xs text-slate-400">
            Note <span className="text-slate-600">(optional)</span>
            <input value={note} maxLength={200} placeholder="e.g. 100 poly mailers" onChange={(e) => setNote(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          <button
            type="submit"
            disabled={!amountValid || !categoryValid || state === "saving"}
            className="h-[42px] rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 sm:col-span-2 xl:col-span-1"
          >
            {state === "saving" ? "Saving…" : editing ? "Save changes" : "Add"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          {canRepeat && (
            <label className="flex items-center gap-2 text-slate-400">
              <input type="checkbox" checked={repeatMonthly} onChange={(e) => setRepeatMonthly(e.target.checked)} className="accent-blue-500" />
              Repeats every month (like a subscription)
            </label>
          )}
          {showWholeBusiness && !editing && (
            <label className="flex items-center gap-2 text-slate-400">
              <input type="checkbox" checked={wholeBusiness} onChange={(e) => setWholeBusiness(e.target.checked)} className="accent-blue-500" />
              Applies to all my stores (not just this one)
            </label>
          )}
          {message && <span className={state === "error" ? "text-rose-400" : "text-emerald-400"}>{message}</span>}
        </div>
      </section>

      {/* Totals, search + list */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151d2d]">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Expenses · {periodLabel}</h3>
            <p className="mt-1 text-2xl font-bold text-white">{money(filtering ? shownTotal : periodTotal)}</p>
            {filtering && <p className="text-xs text-slate-500">of {money(periodTotal)} in this period</p>}
          </div>
          {byCategory.length > 0 && (
            <div className="flex flex-wrap gap-2 md:max-w-[60%] md:justify-end">
              {byCategory.map(([name, value]) => {
                const active = categoryFilter === name;
                return (
                  <button
                    type="button"
                    key={name}
                    onClick={() => setCategoryFilter(active ? null : name)}
                    aria-pressed={active}
                    className={`rounded-lg px-3 py-1.5 text-xs transition ${
                      active ? "bg-blue-600 text-white" : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    {name} · <span className="font-semibold">{money(value)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {expenses.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-6 py-3">
            <div className="relative min-w-[12rem] flex-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expenses by category, note or amount"
                aria-label="Search expenses"
                className={`w-full pl-9 ${field}`}
              />
            </div>
            {filtering && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter(null);
                }}
                className="text-xs font-semibold text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-sm text-slate-400">Loading expenses…</div>
        ) : expenses.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">No expenses in this period yet.</div>
        ) : shown.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">No expenses match your search.</div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {shown.map((expense) => {
              const stopped = Boolean(expense.endedOn);
              const details = [
                expense.note,
                expense.repeatMonthly ? (stopped ? `Monthly · stopped ${prettyDate(expense.endedOn as string)}` : "Monthly") : null,
                showWholeBusiness && expense.ebayUserId === null ? "All stores" : null,
              ].filter(Boolean);
              return (
                <li key={expense.key} className="flex items-center gap-3 px-6 py-3.5 sm:gap-4">
                  <span className="w-24 shrink-0 text-xs text-slate-500 sm:w-28">{prettyDate(expense.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-white">{expense.category}</span>
                      {expense.repeatMonthly && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-400" aria-label="Repeats monthly">
                          <path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" />
                        </svg>
                      )}
                    </span>
                    {details.length > 0 && <span className="block truncate text-xs text-slate-500">{details.join(" · ")}</span>}
                  </span>
                  <span className="text-sm font-semibold text-rose-300">−{money(Number(expense.amount))}</span>
                  <span className="flex shrink-0 items-center">
                    {expense.repeatMonthly && !stopped && (
                      <button
                        type="button"
                        onClick={() => void stopRepeating(expense)}
                        disabled={busyId === expense.id}
                        title="Stop repeating from today (past months stay)"
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
                      >
                        Stop
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(expense)}
                      aria-label="Edit expense"
                      title="Edit"
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(expense)}
                      disabled={busyId === expense.id}
                      aria-label="Delete expense"
                      title="Delete"
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
