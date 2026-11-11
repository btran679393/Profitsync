"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MONTHS, periodLabel, type Line, type TaxReportData } from "@/lib/taxReport";

// The printed (or saved as PDF) profit and loss statement. It's only
// shown when printing (see #ps-print-root in globals.css), as its own
// clean black-on-white document rather than a copy of the screen.

const noop = () => () => {};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
// Accounting style: amounts taken off are shown in brackets.
const amount = (value: number, deduct = false) => {
  const v = deduct ? -value : value;
  if (Math.abs(v) < 0.005) return usd.format(0);
  return v < 0 ? `(${usd.format(-v)})` : usd.format(v);
};

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#5f5bf1" />
      <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" transform="translate(8 8)">
        <path d="M6 34l12-12 8 8 16-16" />
        <path d="M28 14h14v14" />
      </g>
    </svg>
  );
}

function StatementRow({ line, deduct = false, indent = true }: { line: Line; deduct?: boolean; indent?: boolean }) {
  const strong = line.strong;
  return (
    <tr className={strong ? "font-semibold" : ""}>
      <td className={`py-[3pt] ${indent && !strong ? "pl-[12pt]" : ""} ${strong ? "border-t border-black/60" : ""}`}>{line.label}</td>
      <td className={`py-[3pt] text-right tabular-nums ${strong ? "border-t border-black/60" : ""}`}>
        {amount(line.amount, deduct || line.negative)}
      </td>
    </tr>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={2} className="pb-[2pt] pt-[10pt] text-[8pt] font-semibold uppercase tracking-[0.12em] text-gray-600">
        {children}
      </td>
    </tr>
  );
}

export default function TaxPrintout({
  report,
  business,
  notes,
}: {
  report: TaxReportData;
  business: string;
  // "Before you file" items, printed as notes to review.
  notes: string[];
}) {
  // A direct child of <body>, so printing can hide everything else. Only
  // in the browser, after the page has loaded.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [root] = useState(() => {
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.id = "ps-print-root";
    return element;
  });
  useEffect(() => {
    if (!root) return;
    document.body.appendChild(root);
    return () => root.remove();
  }, [root]);

  if (!mounted || !root) return null;
  const today = new Date();
  const prepared = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const host = typeof window === "undefined" ? "" : window.location.host;
  const totalCosts = report.cogs + report.totalCosts;
  const otherExpenses = (m: TaxReportData["months"][number]) => m.refundLosses + m.expenses;
  const activeMonths = report.months.filter((m) => m.orders > 0 || m.expenses > 0);

  return createPortal(
    <article className="mx-auto max-w-[7.3in] bg-white font-sans text-[10pt] leading-[1.35] text-black">
      {/* Letterhead */}
      <header className="flex items-end justify-between gap-6 border-b-2 border-black pb-[8pt]">
        <div className="flex items-center gap-[6pt]">
          <Logo />
          <span className="text-[13pt] font-semibold tracking-tight">ProfitSync</span>
        </div>
        <div className="text-right">
          <h1 className="text-[16pt] font-semibold leading-tight tracking-tight">Profit and Loss Statement</h1>
          <p className="text-[9pt] text-gray-600">Tax year {report.year}</p>
        </div>
      </header>

      {/* Who, when */}
      <dl className="mt-[10pt] grid grid-cols-[auto_1fr_auto_1fr] gap-x-[10pt] gap-y-[3pt] text-[9pt]">
        <dt className="text-gray-600">Business</dt>
        <dd className="font-medium">{business}</dd>
        <dt className="text-gray-600">Prepared</dt>
        <dd>{prepared}</dd>
        <dt className="text-gray-600">Period</dt>
        <dd>{periodLabel(report.year, today)}</dd>
        <dt className="text-gray-600">Orders</dt>
        <dd>
          {report.orderCount.toLocaleString("en-US")}
          {report.refundCount > 0 ? ` (${report.refundCount.toLocaleString("en-US")} refunded)` : ""}
        </dd>
        <dt className="text-gray-600">Currency</dt>
        <dd>US dollars (USD)</dd>
      </dl>

      {/* At a glance */}
      <section className="mt-[12pt] grid grid-cols-3 border border-black/70" style={{ breakInside: "avoid" }}>
        {[
          ["Net sales", amount(report.netSales)],
          ["Total costs and expenses", amount(totalCosts)],
          ["Net profit", amount(report.netProfit)],
        ].map(([label, value], i) => (
          <div key={label} className={`px-[10pt] py-[8pt] ${i > 0 ? "border-l border-black/70" : ""} ${i === 2 ? "bg-gray-100" : ""}`}>
            <p className="text-[8pt] font-semibold uppercase tracking-[0.1em] text-gray-600">{label}</p>
            <p className="mt-[2pt] text-[14pt] font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      {/* The statement */}
      <table className="mt-[10pt] w-full border-collapse text-[10pt]">
        <tbody>
          <SectionTitle>Income</SectionTitle>
          {report.income.map((line) => (
            <StatementRow key={line.label} line={line} />
          ))}
          <SectionTitle>Business expenses</SectionTitle>
          {report.costs.map((line) => (
            <StatementRow key={line.label} line={line} />
          ))}
          <StatementRow line={{ label: "Total business expenses", amount: report.totalCosts, strong: true }} />
          <tr className="text-[11pt] font-semibold">
            <td className="pt-[8pt]">
              <span className="border-b-[3px] border-double border-black pb-[1pt]">Net profit</span>
            </td>
            <td className="pt-[8pt] text-right tabular-nums">
              <span className="border-b-[3px] border-double border-black pb-[1pt]">{amount(report.netProfit)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Month by month */}
      {activeMonths.length > 0 && (
        <section className="mt-[18pt]" style={{ breakInside: "avoid" }}>
          <h2 className="border-b border-black pb-[3pt] text-[11pt] font-semibold">Month by month</h2>
          <table className="mt-[4pt] w-full border-collapse text-[8.5pt]">
            <thead>
              <tr className="text-right text-[7.5pt] uppercase tracking-[0.06em] text-gray-600">
                <th className="py-[3pt] text-left font-semibold">Month</th>
                <th className="py-[3pt] font-semibold">Orders</th>
                <th className="py-[3pt] font-semibold">Net sales</th>
                <th className="py-[3pt] font-semibold">Product costs</th>
                <th className="py-[3pt] font-semibold">eBay fees</th>
                <th className="py-[3pt] font-semibold">Shipping</th>
                <th className="py-[3pt] font-semibold">Other expenses</th>
                <th className="py-[3pt] font-semibold">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((m) => {
                // Months still to come in the current year.
                const future = report.year === today.getFullYear() && m.month > today.getMonth();
                const cell = (value: number) => (future ? "—" : amount(value));
                return (
                  <tr key={m.month} className={`border-t border-gray-300 text-right tabular-nums ${future ? "text-gray-400" : ""}`}>
                    <td className="py-[2.5pt] text-left">{MONTHS[m.month]}</td>
                    <td className="py-[2.5pt]">{future ? "—" : m.orders}</td>
                    <td className="py-[2.5pt]">{cell(m.netSales)}</td>
                    <td className="py-[2.5pt]">{cell(m.cogs)}</td>
                    <td className="py-[2.5pt]">{cell(m.ebayFees + m.otherFees)}</td>
                    <td className="py-[2.5pt]">{cell(m.shipping)}</td>
                    <td className="py-[2.5pt]">{cell(otherExpenses(m))}</td>
                    <td className="py-[2.5pt] font-medium">{cell(m.netProfit)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-black text-right font-semibold tabular-nums">
                <td className="py-[3pt] text-left">Total</td>
                <td className="py-[3pt]">{report.orderCount}</td>
                <td className="py-[3pt]">{amount(report.netSales)}</td>
                <td className="py-[3pt]">{amount(report.cogs)}</td>
                <td className="py-[3pt]">{amount(report.ebayFees + report.otherFees)}</td>
                <td className="py-[3pt]">{amount(report.shipping)}</td>
                <td className="py-[3pt]">{amount(report.refundLosses + report.expenseTotal)}</td>
                <td className="py-[3pt]">{amount(report.netProfit)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-[3pt] text-[7.5pt] text-gray-600">
            eBay fees include other eBay charges such as promoted listings. Other expenses are the business expenses you
            entered plus losses on refunded orders.
          </p>
        </section>
      )}

      {/* Things to check */}
      {notes.length > 0 && (
        <section className="mt-[16pt] border border-black/60 px-[10pt] py-[8pt]" style={{ breakInside: "avoid" }}>
          <h2 className="text-[10pt] font-semibold">Items to review before filing</h2>
          <ul className="mt-[3pt] list-disc space-y-[2pt] pl-[14pt] text-[9pt]">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {/* How the numbers work */}
      <section className="mt-[16pt] text-[8pt] leading-[1.45] text-gray-700" style={{ breakInside: "avoid" }}>
        <h2 className="text-[9pt] font-semibold text-black">About these numbers</h2>
        <ul className="mt-[3pt] list-disc space-y-[1pt] pl-[14pt]">
          <li>Amounts are grouped by order date. Sales are what buyers paid, not counting sales tax that eBay collects and pays for you.</li>
          <li>Refunded orders are taken out of sales. Only what a refund cost you (an item not returned, return shipping, fees eBay kept) counts as a loss.</li>
          <li>eBay fees and charges come from eBay&apos;s own payment records. Product costs, shipping you paid outside eBay and business expenses are as entered in ProfitSync.</li>
          <li>This statement isn&apos;t tax advice. Check it with a tax professional before you file.</li>
        </ul>
      </section>

      <footer className="mt-[18pt] flex justify-between border-t border-gray-400 pt-[4pt] text-[7.5pt] text-gray-600">
        <span>Prepared with ProfitSync{host ? ` · ${host}` : ""}</span>
        <span>{business} · {report.year}</span>
      </footer>
    </article>,
    root
  );
}
