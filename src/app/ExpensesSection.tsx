"use client";

import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

export type Expense = {
  id: number;
  ebayUserId: string | null;
  spentOn: string; // YYYY-MM-DD
  category: string;
  amount: string | number;
  note: string | null;
};

export type NewExpense = {
  spentOn: string;
  category: string;
  amount: string;
  note: string;
  wholeBusiness: boolean;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function prettyDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ExpensesSection({
  expenses,
  enabled,
  loading,
  periodLabel,
  showWholeBusiness,
  onAdd,
  onDelete,
}: {
  expenses: Expense[]; // already filtered to the chosen date range
  enabled: boolean;
  loading: boolean;
  periodLabel: string;
  showWholeBusiness: boolean;
  onAdd: (expense: NewExpense) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [spentOn, setSpentOn] = useState(today);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [wholeBusiness, setWholeBusiness] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.trim());

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount));
    }
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const total = byCategory.reduce((sum, [, value]) => sum + value, 0);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!amountValid) return;
    setState("saving");
    setMessage("");
    try {
      await onAdd({ spentOn, category, amount: amount.trim(), note, wholeBusiness });
      setAmount("");
      setNote("");
      setState("idle");
      setMessage("Expense added.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Couldn't add the expense.");
    }
  }

  async function remove(expense: Expense) {
    if (!window.confirm(`Delete this ${money(Number(expense.amount))} ${expense.category.toLowerCase()} expense?`)) return;
    setDeletingId(expense.id);
    try {
      await onDelete(expense.id);
    } finally {
      setDeletingId(null);
    }
  }

  const field = "rounded-xl border border-white/10 bg-[#0b1120] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500";

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
      {/* Add an expense */}
      <section className="rounded-2xl border border-white/[0.07] bg-[#151d2d] p-6">
        <h3 className="text-base font-semibold text-white">Add an expense</h3>
        <p className="mt-1 text-xs text-slate-500">
          Costs that aren&apos;t tied to one sale. They&apos;re subtracted from your Net Profit.
        </p>
        <form onSubmit={add} className="mt-5 grid gap-3 md:grid-cols-[150px_200px_130px_1fr_auto] md:items-end">
          <label className="text-xs text-slate-400">
            Date
            <input type="date" required value={spentOn} max={today()} onChange={(e) => setSpentOn(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          <label className="text-xs text-slate-400">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 w-full ${field}`}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
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
            Note (optional)
            <input value={note} maxLength={200} placeholder="e.g. 100 poly mailers" onChange={(e) => setNote(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          <button
            type="submit"
            disabled={!amountValid || state === "saving"}
            className="h-[42px] rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {state === "saving" ? "Adding…" : "Add"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          {showWholeBusiness && (
            <label className="flex items-center gap-2 text-slate-400">
              <input type="checkbox" checked={wholeBusiness} onChange={(e) => setWholeBusiness(e.target.checked)} className="accent-blue-500" />
              Applies to all my stores (not just this one)
            </label>
          )}
          {message && <span className={state === "error" ? "text-rose-400" : "text-emerald-400"}>{message}</span>}
        </div>
      </section>

      {/* Totals + list */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#151d2d]">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Expenses · {periodLabel}</h3>
            <p className="mt-1 text-2xl font-bold text-white">{money(total)}</p>
          </div>
          {byCategory.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {byCategory.map(([name, value]) => (
                <span key={name} className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs text-slate-300">
                  {name} · <span className="font-semibold text-white">{money(value)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-slate-400">Loading expenses…</div>
        ) : expenses.length === 0 ? (
          <div className="py-14 text-center text-sm text-slate-400">No expenses in this period yet.</div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center gap-4 px-6 py-3.5">
                <span className="w-28 shrink-0 text-xs text-slate-500">{prettyDate(expense.spentOn)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-white">{expense.category}</span>
                  {(expense.note || (showWholeBusiness && expense.ebayUserId === null)) && (
                    <span className="block truncate text-xs text-slate-500">
                      {expense.note}
                      {showWholeBusiness && expense.ebayUserId === null && (expense.note ? " · " : "") + "All stores"}
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold text-rose-300">−{money(Number(expense.amount))}</span>
                <button
                  type="button"
                  onClick={() => void remove(expense)}
                  disabled={deletingId === expense.id}
                  aria-label="Delete expense"
                  className="rounded-lg p-1.5 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
