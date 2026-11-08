"use client";

import { useMemo, useState } from "react";
import type { ExpenseEntry } from "./ExpensesSection";
import { buttonClasses } from "@/components/ui";

// What the report needs from each order (worked out by the dashboard with
// the same rules as everywhere else in ProfitSync).
export type TaxOrder = {
  orderDate: string | null;
  refunded: boolean;
  salePrice: number;
  ebayFees: number;
  otherFees: number;
  shipping: number;
  productCost: number | null;
  // What a refund cost you (lost item, return shipping, fees kept by eBay).
  refundLoss: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function yearOf(date: string | null) {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

type Line = { label: string; amount: number; hint?: string; strong?: boolean; negative?: boolean };

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function TaxReport({
  orders,
  expenses,
  storeLabel,
  allowed,
  onUpgrade,
}: {
  orders: TaxOrder[];
  expenses: ExpenseEntry[];
  storeLabel: string;
  // False on the Free plan: the report is shown blurred with an upgrade box.
  allowed: boolean;
  onUpgrade: () => void;
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
    const inYear = orders.filter((order) => yearOf(order.orderDate) === year);
    const kept = inYear.filter((order) => !order.refunded);
    const refunded = inYear.filter((order) => order.refunded);
    const sum = (list: TaxOrder[], pick: (o: TaxOrder) => number) => list.reduce((total, o) => total + pick(o), 0);

    const grossSales = sum(inYear, (o) => o.salePrice);
    const refunds = sum(refunded, (o) => o.salePrice);
    const netSales = grossSales - refunds;
    const cogs = sum(kept, (o) => o.productCost ?? 0);
    const missingCost = kept.filter((o) => o.productCost === null).length;
    const ebayFees = sum(kept, (o) => o.ebayFees);
    const otherFees = sum(kept, (o) => o.otherFees);
    const shipping = sum(kept, (o) => o.shipping);
    const refundLosses = sum(refunded, (o) => o.refundLoss);

    const byCategory = new Map<string, number>();
    for (const expense of expenses) {
      if (yearOf(expense.date) !== year) continue;
      byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + Number(expense.amount));
    }
    const expenseTotal = [...byCategory.values()].reduce((a, b) => a + b, 0);
    const grossProfit = netSales - cogs;
    const netProfit = grossProfit - ebayFees - otherFees - shipping - refundLosses - expenseTotal;

    return {
      orderCount: inYear.length,
      refundCount: refunded.length,
      missingCost,
      income: [
        { label: "Gross sales", amount: grossSales, hint: "Schedule C, line 1" },
        { label: "Refunds and returns", amount: refunds, hint: "Line 2", negative: true },
        { label: "Net sales", amount: netSales, strong: true },
        { label: "Cost of goods sold (product costs)", amount: cogs, hint: "Line 4", negative: true },
        { label: "Gross profit", amount: grossProfit, strong: true },
      ] as Line[],
      costs: [
        { label: "eBay selling fees", amount: ebayFees, hint: "Line 10 (commissions and fees)" },
        { label: "Other eBay charges (e.g. promoted listings)", amount: otherFees, hint: "Line 8 (advertising)" },
        { label: "Shipping and postage", amount: shipping, hint: "Part V (other expenses)" },
        { label: "Losses on refunded orders", amount: refundLosses, hint: "Part V (other expenses)" },
        ...[...byCategory].sort((a, b) => b[1] - a[1]).map(([label, amount]) => ({ label, amount, hint: "Your expenses" })),
      ] as Line[],
      totalCosts: ebayFees + otherFees + shipping + refundLosses + expenseTotal,
      netProfit,
    };
  }, [orders, expenses, year]);

  function downloadCsv() {
    const rows: Array<[string, string | number]> = [
      ["ProfitSync tax summary", `${year}`],
      ["Store", storeLabel],
      ["Orders", report.orderCount],
      ["", ""],
      ...report.income.map((l) => [l.label, (l.negative ? -l.amount : l.amount).toFixed(2)] as [string, string]),
      ["", ""],
      ...report.costs.map((l) => [l.label, (-l.amount).toFixed(2)] as [string, string]),
      ["Total business costs", (-report.totalCosts).toFixed(2)],
      ["", ""],
      ["Net profit", report.netProfit.toFixed(2)],
    ];
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profitsync-tax-summary-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const row = (line: Line, sign: "+" | "-") => (
    <div
      key={line.label}
      className={`flex items-baseline justify-between gap-4 px-6 py-3 print:px-0 print:py-1.5 ${line.strong ? "bg-surface-2/60 print:bg-transparent" : ""}`}
    >
      <span className="min-w-0">
        <span className={`block text-sm print:text-black ${line.strong ? "font-semibold text-ink" : "text-ink-2"}`}>{line.label}</span>
        {line.hint && <span className="block text-[11px] text-subtle print:text-gray-500">{line.hint}</span>}
      </span>
      <span className={`shrink-0 text-sm tabular-nums print:text-black ${line.strong ? "font-semibold text-ink" : "text-ink"}`}>
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
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Tax year"
            className="h-9 rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            type="button"
            onClick={() => (allowed ? downloadCsv() : onUpgrade())}
            className={buttonClasses("secondary", "md")}
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => (allowed ? window.print() : onUpgrade())}
            className={buttonClasses("primary", "md")}
          >
            Print or save as PDF
          </button>
        </div>
      </div>

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
              {report.refundCount > 0 ? ` · ${report.refundCount} refunded` : ""} · January 1 – December 31, {year}
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
            {report.missingCost > 0 && (
              <p className="text-warn print:text-black">
                {report.missingCost} order{report.missingCost === 1 ? " has" : "s have"} no product cost yet, so cost of goods
                sold may be too low. Add them on the Orders or Listings page.
              </p>
            )}
            <p>
              Sales are what buyers paid, not counting sales tax that eBay collects and pays for you. Line numbers refer to
              the US Schedule C and are only a guide. This summary isn&apos;t tax advice: check it with a tax professional
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
              <button
                type="button"
                onClick={onUpgrade}
                className={buttonClasses("primary", "md", "mt-4 w-full")}
              >
                See plans
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
