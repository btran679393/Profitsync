"use client";

import { useMemo, useState } from "react";
import type { ExpenseEntry } from "./ExpensesSection";
import TaxPrintout from "./TaxPrintout";
import { Button, LoadingRegion, Menu, Notice, SegmentedControl, Select, Skeleton } from "@/components/ui";
import {
  buildTaxReport,
  expensesCsv,
  exportFileName,
  ordersCsv,
  periodLabel,
  profitAndLossCsv,
  yearOf,
  type Line,
  type TaxOrder,
} from "@/lib/taxReport";

export type { TaxOrder } from "@/lib/taxReport";

type Warning = { key: string; text: string; fix?: { label: string; onClick: () => void } };

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function saveFile(text: string, fileName: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TaxReport({
  orders,
  expenses,
  storeLabel,
  allowed,
  onUpgrade,
  loading = false,
  scope = null,
  onScopeChange,
  currentStoreName = "This store",
  onFix,
}: {
  orders: TaxOrder[];
  expenses: ExpenseEntry[];
  storeLabel: string;
  // False on the Free plan: the report is shown blurred with an upgrade box.
  allowed: boolean;
  onUpgrade: () => void;
  loading?: boolean;
  // With several stores: whole business or just the store being viewed.
  scope?: "business" | "store" | null;
  onScopeChange?: (scope: "business" | "store") => void;
  currentStoreName?: string;
  // Buttons on the "before you file" warnings.
  // costs / refunds get the store to open when every such order is in one store.
  onFix?: { costs?: (storeId?: string) => void; shipping?: () => void; refunds?: (storeId?: string) => void };
}) {
  const years = useMemo(() => {
    const found = new Set<number>([new Date().getFullYear()]);
    for (const order of orders) {
      const year = yearOf(order.orderDate);
      if (year) found.add(year);
    }
    for (const expense of expenses) {
      const year = yearOf(expense.date);
      if (year) found.add(year);
    }
    return [...found].sort((a, b) => b - a);
  }, [orders, expenses]);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const report = useMemo(() => {
    const base = buildTaxReport(orders, expenses, year);
    const inYear = orders.filter((order) => !order.canceled && yearOf(order.orderDate) === year);
    const kept = inYear.filter((order) => !order.refunded);
    const refunded = inYear.filter((order) => order.refunded);
    // " in vintagekitcorner" when covering several stores, so the seller
    // knows which store to open.
    const where = (list: TaxOrder[]) => {
      if (scope !== "business") return "";
      const names = [...new Set(list.map((o) => o.storeName).filter(Boolean))];
      return names.length > 0 && names.length <= 3 ? ` in ${names.join(", ")}` : "";
    };
    const missingCostWhere = where(kept.filter((o) => o.productCost === null));
    const unreviewedWhere = where(refunded.filter((o) => o.refundUnreviewed));
    // The one store those orders are in (so the fix button can open it).
    const onlyStore = (list: TaxOrder[]) => {
      const ids = [...new Set(list.map((o) => o.storeId).filter((id): id is string => Boolean(id)))];
      return ids.length === 1 ? ids[0] : undefined;
    };
    const missingCostStore = onlyStore(kept.filter((o) => o.productCost === null));
    const unreviewedStore = onlyStore(refunded.filter((o) => o.refundUnreviewed));

    return { ...base, missingCostWhere, unreviewedWhere, missingCostStore, unreviewedStore };
  }, [orders, expenses, year, scope]);

  // For the spreadsheets and the printout.
  const exportHeader = () => ({ business: storeLabel, year, preparedOn: new Date() });
  const storeNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const order of orders) if (order.storeId && order.storeName) names.set(order.storeId, order.storeName);
    return names;
  }, [orders]);
  const expensesInYear = expenses.filter((e) => yearOf(e.date) === year).length;

  function download(kind: "pl" | "orders" | "expenses") {
    if (!allowed) return onUpgrade();
    if (kind === "pl") saveFile(profitAndLossCsv(report, exportHeader()), exportFileName("Profit and Loss", year, storeLabel));
    if (kind === "orders") saveFile(ordersCsv(orders, exportHeader()), exportFileName("Orders", year, storeLabel));
    if (kind === "expenses") {
      saveFile(
        expensesCsv(expenses, exportHeader(), (id) => storeNames.get(id) ?? null),
        exportFileName("Business Expenses", year, storeLabel)
      );
    }
  }

  // The PDF's file name comes from the page title while printing.
  function print() {
    if (!allowed) return onUpgrade();
    const title = document.title;
    document.title = exportFileName("Profit and Loss", year, storeLabel, "").replace(/\.$/, "");
    const restore = () => {
      document.title = title;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  // Things that would make the numbers wrong, with a way to fix each.
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const warnings: Warning[] = [];
  if (report.missingCost > 0) {
    warnings.push({
      key: "costs",
      text: `${plural(report.missingCost, "order", "orders")}${report.missingCostWhere} ${report.missingCost === 1 ? "has" : "have"} no product cost, so your profit looks higher than it is.`,
      fix: onFix?.costs && { label: "Add costs", onClick: () => onFix.costs?.(report.missingCostStore) },
    });
  }
  if (report.keptCount > 0 && report.noShipping === report.keptCount) {
    warnings.push({
      key: "shipping",
      text: "No shipping costs recorded. If you paid for postage, add it so it counts as a business cost.",
      fix: onFix?.shipping && { label: "Add shipping", onClick: onFix.shipping },
    });
  } else if (report.noShipping > 0) {
    warnings.push({
      key: "shipping",
      text: `${plural(report.noShipping, "order has", "orders have")} no shipping cost. Fine if the buyer's postage was free to you; otherwise add it.`,
      fix: onFix?.shipping && { label: "Review shipping", onClick: onFix.shipping },
    });
  }
  if (report.unreviewed > 0) {
    warnings.push({
      key: "refunds",
      text: `${plural(report.unreviewed, "refund", "refunds")}${report.unreviewedWhere} ${report.unreviewed === 1 ? "has" : "have"} a loss ProfitSync can't work out yet. Set your return policy on the Orders page, or review ${report.unreviewed === 1 ? "it" : "them"}.`,
      fix: onFix?.refunds && { label: "Review refunds", onClick: () => onFix.refunds?.(report.unreviewedStore) },
    });
  }
  if (report.orderCount > 0 && report.expenseCount === 0) {
    warnings.push({
      key: "expenses",
      text: `No business expenses recorded for ${year}. Supplies, software and mileage can lower your tax.`,
    });
  }

  const row = (line: Line, sign: "+" | "-") => (
    <div
      key={line.label}
      className={`flex items-baseline justify-between gap-4 px-6 py-3 print:px-0 print:py-1.5 ${line.strong ? "bg-surface-2/60 print:bg-transparent" : ""}`}
    >
      <span className="min-w-0">
        <span className={`block text-sm print:text-black ${line.strong ? "font-semibold text-ink" : "text-ink-2"}`}>{line.label}</span>
      </span>
      <span
        className={`shrink-0 text-sm tabular-nums print:text-black ${line.strong ? "font-semibold text-ink" : line.amount === 0 ? "text-subtle" : "text-ink"}`}
      >
        {(sign === "-" || line.negative) && line.amount > 0 ? "−" : ""}
        {money(line.amount)}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">A profit and loss summary for the year, to give your accountant or use when you file.</p>
        <div className="flex flex-wrap items-center gap-2">
          {scope && onScopeChange && (
            <SegmentedControl
              label="Which stores"
              value={scope}
              onChange={onScopeChange}
              options={[
                { value: "business", label: "All stores" },
                { value: "store", label: currentStoreName },
              ]}
            />
          )}
          <span className="w-28">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Tax year">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </span>
          {allowed ? (
            <Menu
              label="Download spreadsheets"
              trigger={({ toggle, ...aria }) => (
                <Button
                  variant="secondary"
                  onClick={toggle}
                  {...aria}
                  iconRight={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  }
                >
                  Download
                </Button>
              )}
              items={[
                {
                  label: "Profit and loss (CSV)",
                  hint: "The statement, with a column for each month",
                  onSelect: () => download("pl"),
                },
                {
                  label: "Every order (CSV)",
                  hint: `All ${report.orderCount.toLocaleString("en-US")} orders in ${year}, with totals that match`,
                  disabled: report.orderCount === 0,
                  onSelect: () => download("orders"),
                },
                {
                  label: "Business expenses (CSV)",
                  hint: expensesInYear ? `Every expense you entered for ${year}` : `No expenses entered for ${year}`,
                  disabled: expensesInYear === 0,
                  onSelect: () => download("expenses"),
                },
              ]}
            />
          ) : (
            <Button variant="secondary" onClick={onUpgrade}>
              Download
            </Button>
          )}
          <Button variant="primary" onClick={print}>
            Print or save as PDF
          </Button>
        </div>
      </div>

      {allowed && !loading && warnings.length > 0 && (
        <Notice tone="warn" title="Before you file" className="no-print">
          <ul className="mt-1 space-y-2">
            {warnings.map((w) => (
              <li key={w.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span>{w.text}</span>
                {w.fix && (
                  <Button variant="secondary" size="sm" onClick={w.fix.onClick}>
                    {w.fix.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {loading ? (
        <LoadingRegion label="Loading all your stores">
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="mb-4 text-sm text-muted">Adding up all your stores…</p>
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          </div>
        </LoadingRegion>
      ) : (
      <div className="relative">
        <section
          id="tax-report"
          aria-hidden={!allowed}
          className={`overflow-hidden rounded-xl border border-line bg-surface print:rounded-none print:border-0 print:bg-white ${
            allowed ? "" : "pointer-events-none select-none blur-[6px]"
          }`}
        >
          <div className="border-b border-line px-6 py-5 print:border-gray-300 print:px-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle print:text-gray-500">ProfitSync · Tax summary</p>
            <h4 className="mt-1 text-xl font-semibold tracking-tight text-ink print:text-black">
              {year} · {storeLabel}
            </h4>
            <p className="mt-1 text-xs text-muted print:text-gray-600">
              {report.orderCount} order{report.orderCount === 1 ? "" : "s"}
              {report.refundCount > 0 ? ` · ${report.refundCount} refunded` : ""} · {periodLabel(year)}
            </p>
          </div>

          <div className="divide-y divide-line print:divide-gray-200">
            <p className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle print:px-0">Income</p>
            {report.income.map((line) => row(line, "+"))}
            <p className="px-6 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle print:px-0">Business costs</p>
            {report.costs.map((line) => row(line, "-"))}
            {row({ label: "Total business costs", amount: report.totalCosts, strong: true }, "-")}
          </div>

          <div className="flex items-baseline justify-between border-t border-line bg-accent-soft px-6 py-5 print:border-gray-400 print:bg-transparent print:px-0">
            <span className="text-base font-semibold text-ink print:text-black">Net profit</span>
            <span className={`text-2xl font-semibold tabular-nums print:text-black ${report.netProfit >= 0 ? "text-profit" : "text-loss"}`}>
              {money(report.netProfit)}
            </span>
          </div>

          <div className="space-y-1 px-6 py-4 text-[11px] leading-5 text-subtle print:px-0 print:text-gray-600">
            {/* On screen this is in "Before you file"; keep it on the printout. */}
            {report.missingCost > 0 && (
              <p className="hidden print:block print:text-black">
                {report.missingCost} order{report.missingCost === 1 ? " has" : "s have"} no product cost yet, so cost of goods
                sold may be too low. Add them on the Orders or Listings page.
              </p>
            )}
            <p>
              Sales are what buyers paid, not counting sales tax that eBay collects and pays for you. This summary isn&apos;t tax advice: check it with a tax professional
              before you file.
            </p>
          </div>
        </section>

        {!allowed && (
          <div className="absolute inset-0 flex items-start justify-center p-6 pt-20">
            <div className="max-w-sm rounded-2xl border border-accent/30 bg-elevated p-6 text-center shadow-pop">
              <p className="text-base font-semibold text-ink">Your tax summary is ready</p>
              <p className="mt-2 text-sm text-muted">
                See your full-year numbers, print them or save as PDF, and download a spreadsheet for your accountant with
                Pro or Ultimate.
              </p>
              <Button variant="primary" onClick={onUpgrade} className="mt-4 w-full">
                See plans
              </Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Only appears when printing. */}
      {allowed && !loading && <TaxPrintout report={report} business={storeLabel} notes={warnings.map((w) => w.text)} />}
    </div>
  );
}
