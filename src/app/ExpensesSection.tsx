"use client";

import { useMemo, useState } from "react";
import { EXPENSE_CATEGORIES, MAX_CATEGORY_LENGTH } from "@/lib/expenses";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingRegion,
  MoneyInput,
  Notice,
  Select,
  Skeleton,
  cn,
  useConfirm,
  useToast,
} from "@/components/ui";

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

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

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

// Same colour for a category everywhere on the page.
const CATEGORY_COLORS = ["var(--ps-accent)", "#38bdf8", "#f59e0b", "#a78bfa", "#f472b6", "#34d399", "#94a3b8", "#fb923c"];

const RepeatIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11V9a3 3 0 0 1 3-3h15" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v2a3 3 0 0 1-3 3H3" />
  </svg>
);

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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [spentOn, setSpentOn] = useState(todayKey);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [wholeBusiness, setWholeBusiness] = useState(false);
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  // Suggested categories first, then the seller's own.
  const options = useMemo(() => {
    const own = categories.filter((c) => !(EXPENSE_CATEGORIES as readonly string[]).includes(c)).sort((a, b) => a.localeCompare(b));
    return [...EXPENSE_CATEGORIES, ...own];
  }, [categories]);

  const colorOf = (name: string) => {
    const index = options.indexOf(name);
    return CATEGORY_COLORS[(index < 0 ? name.length : index) % CATEGORY_COLORS.length];
  };

  const chosenCategory = category === CUSTOM ? customCategory.trim() : category;
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.trim());
  const categoryValid = chosenCategory.length > 0 && chosenCategory.length <= MAX_CATEGORY_LENGTH;

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return expenses.filter((expense) => {
      if (categoryFilter && expense.category !== categoryFilter) return false;
      if (words.length === 0) return true;
      const haystack = [expense.category, expense.note ?? "", Number(expense.amount).toFixed(2), prettyDate(expense.date), expense.repeatMonthly ? "monthly repeating" : ""]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [expenses, search, categoryFilter]);

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) totals.set(expense.category, (totals.get(expense.category) ?? 0) + Number(expense.amount));
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
    setError("");
    setState("idle");
  }

  function openNew() {
    resetForm();
    setFormOpen(true);
  }

  function startEdit(expense: Expense) {
    resetForm();
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
    setFormOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!amountValid || !categoryValid) return;
    setState("saving");
    setError("");
    try {
      if (editing) {
        await onUpdate(editing.id, {
          spentOn,
          category: chosenCategory,
          amount: amount.trim(),
          note,
          ...(canRepeat ? { repeatMonthly } : {}),
        });
        toast.success("Expense updated");
      } else {
        await onAdd({ spentOn, category: chosenCategory, amount: amount.trim(), note, wholeBusiness, repeatMonthly });
        toast.success(repeatMonthly ? "Monthly expense added" : "Expense added", `${chosenCategory} · ${money(Number(amount))}`);
      }
      resetForm();
      setFormOpen(false);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't save the expense.");
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
      toast.success("Expense deleted");
    } catch (e) {
      toast.error("Couldn't delete the expense", e instanceof Error ? e.message : undefined);
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
      toast.success("Stopped repeating");
    } catch (e) {
      toast.error("Couldn't stop it", e instanceof Error ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  if (!enabled && !loading) {
    return (
      <Notice tone="warn" title="Expenses aren't available right now">
        Please try again a little later.
      </Notice>
    );
  }

  const form = (
    <Drawer
      open={formOpen}
      onClose={() => setFormOpen(false)}
      size="sm"
      title={editing ? "Edit expense" : "Add an expense"}
      description={
        editing
          ? editing.repeatMonthly
            ? "Changes apply to every month of this repeating expense."
            : "Change any detail, then save."
          : "Costs that aren't tied to one sale. They come off your net profit."
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" variant="primary" disabled={!amountValid || !categoryValid} loading={state === "saving"}>
            {editing ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput data-autofocus required value={amount} placeholder="12.50" onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount) && !amountValid} />
          </Field>
          <Field label={repeatMonthly ? "First date" : "Date"}>
            <Input type="date" required value={spentOn} max={todayKey()} onChange={(e) => setSpentOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Category" hint={category === CUSTOM ? `Up to ${MAX_CATEGORY_LENGTH} characters. It'll be in the list next time.` : undefined}>
          {category === CUSTOM ? (
            <span className="relative block">
              <Input
                autoFocus
                value={customCategory}
                maxLength={MAX_CATEGORY_LENGTH}
                placeholder="e.g. Storage unit"
                onChange={(e) => setCustomCategory(e.target.value)}
                className="pr-9"
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
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-subtle hover:text-ink"
              >
                ✕
              </button>
            </span>
          ) : (
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {options.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={CUSTOM}>+ Your own category…</option>
            </Select>
          )}
        </Field>
        <Field label="Note" optional>
          <Input value={note} maxLength={200} placeholder="e.g. 100 poly mailers" onChange={(e) => setNote(e.target.value)} />
        </Field>
        {/* Repeating expenses only show once that feature is switched on. */}
        {(canRepeat || (showWholeBusiness && !editing)) && (
        <div className="space-y-2.5 rounded-lg border border-line bg-surface-2 p-3">
          {canRepeat && (
            <Checkbox checked={repeatMonthly} onChange={(e) => setRepeatMonthly(e.target.checked)} label="Repeats every month (like a subscription)" />
          )}
          {showWholeBusiness && !editing && (
            <Checkbox checked={wholeBusiness} onChange={(e) => setWholeBusiness(e.target.checked)} label="Applies to all my stores (not just this one)" />
          )}
        </div>
        )}
        {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      </form>
    </Drawer>
  );

  return (
    <div className="space-y-5">
      {form}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <p className="text-xs font-medium text-muted">Expenses · {periodLabel}</p>
            <p className="ps-num mt-1 text-2xl font-semibold tracking-tight text-ink">{money(filtering ? shownTotal : periodTotal)}</p>
            {filtering && <p className="ps-num text-xs text-subtle">of {money(periodTotal)} in this period</p>}
          </div>
          <Button variant="primary" onClick={openNew} icon={<span className="text-base leading-none">+</span>}>
            Add expense
          </Button>
        </div>
        {byCategory.length > 0 && (
          <div className="px-5 pb-5">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              {byCategory.map(([name, value]) => (
                <span key={name} className="h-full" style={{ width: `${(value / periodTotal) * 100}%`, background: colorOf(name) }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {byCategory.map(([name, value]) => {
                const active = categoryFilter === name;
                return (
                  <button
                    type="button"
                    key={name}
                    onClick={() => setCategoryFilter(active ? null : name)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                      active ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                    )}
                  >
                    <span className="h-2 w-2 rounded-sm" style={{ background: colorOf(name) }} aria-hidden="true" />
                    {name}
                    <span className="ps-num font-semibold text-ink">{money(value)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {expenses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
            <div className="relative min-w-[12rem] flex-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by category, note or amount" aria-label="Search expenses" className="pl-9" />
            </div>
            {filtering && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setCategoryFilter(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <LoadingRegion label="Loading expenses">
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </LoadingRegion>
        ) : expenses.length === 0 ? (
          <EmptyState
            title="No expenses in this period"
            description="Add packing supplies, your eBay Store subscription, software and other costs that aren't tied to one sale."
            action={
              <Button variant="primary" onClick={openNew}>
                Add your first expense
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState title="No expenses match" description="Try another search or category." />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((expense) => {
              const stopped = Boolean(expense.endedOn);
              const details = [
                expense.note,
                expense.repeatMonthly ? (stopped ? `Monthly · stopped ${prettyDate(expense.endedOn as string)}` : "Repeats monthly") : null,
                showWholeBusiness && expense.ebayUserId === null ? "All stores" : null,
              ].filter(Boolean);
              return (
                <li key={expense.key} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:gap-4 sm:px-5">
                  <span className="hidden w-24 shrink-0 text-xs text-muted sm:block">{prettyDate(expense.date)}</span>
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colorOf(expense.category) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{expense.category}</span>
                      {expense.repeatMonthly && (
                        <Badge tone={stopped ? "neutral" : "accent"}>
                          <RepeatIcon />
                          <span className="sr-only">Repeats monthly</span>
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      <span className="sm:hidden">{prettyDate(expense.date)}{details.length ? " · " : ""}</span>
                      {details.join(" · ")}
                    </span>
                  </span>
                  <span className="ps-num text-sm font-semibold text-loss">−{money(Number(expense.amount))}</span>
                  <span className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    {expense.repeatMonthly && !stopped && (
                      <Button variant="ghost" size="sm" onClick={() => void stopRepeating(expense)} disabled={busyId === expense.id} title="Stop repeating from today (past months stay)">
                        Stop
                      </Button>
                    )}
                    <IconButton label="Edit expense" size="sm" onClick={() => startEdit(expense)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </IconButton>
                    <IconButton label="Delete expense" size="sm" onClick={() => void remove(expense)} disabled={busyId === expense.id} className="hover:bg-loss-soft hover:text-loss">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
