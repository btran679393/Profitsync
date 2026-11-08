"use client";

import { useMemo, useState } from "react";

// What these tools need from each order (a subset of the dashboard's Order).
export type ToolOrder = {
  ebayOrderId: string | null;
  orderDate: string | null;
  item: string;
  quantity: number;
  status: string;
  salePrice: number;
  refundAmount: number;
  ebayFees: number;
  otherFees: number;
  shipping: number;
  productCost: number | null;
  profit: number | null;
};

// ------------------------------------------------------------
// Download: a spreadsheet (CSV) of the orders shown, for taxes/accounting
// ------------------------------------------------------------

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(orders: ToolOrder[], label: string) {
  const header = [
    "Date", "eBay order number", "Item", "Quantity", "Status", "Sale", "Refund",
    "eBay fees", "Other eBay fees", "Shipping", "Product cost", "Profit",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const order of orders) {
    lines.push(
      [
        order.orderDate ? order.orderDate.slice(0, 10) : "",
        order.ebayOrderId,
        order.item,
        order.quantity,
        order.status,
        order.salePrice.toFixed(2),
        order.refundAmount.toFixed(2),
        order.ebayFees.toFixed(2),
        order.otherFees.toFixed(2),
        order.shipping.toFixed(2),
        order.productCost === null ? "" : order.productCost.toFixed(2),
        order.profit === null ? "" : order.profit.toFixed(2),
      ].map(csvCell).join(",")
    );
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `profitsync-orders-${label.toLowerCase().replace(/\s+/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------
// Import: shipping costs from a spreadsheet (e.g. Pirate Ship's export)
// ------------------------------------------------------------

// Small CSV reader (handles quotes, commas and new lines inside quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const ORDER_NUMBER = /\b\d{2}-\d{5}-\d{5}\b/;

function guessColumn(headers: string[], words: string[]) {
  const index = headers.findIndex((h) => words.some((w) => h.toLowerCase().includes(w)));
  return index >= 0 ? index : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function ShippingImport({
  knownOrderIds,
  enabled,
  onClose,
  onImported,
}: {
  knownOrderIds: Set<string>;
  enabled: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [orderCol, setOrderCol] = useState(0);
  const [costCol, setCostCol] = useState(0);
  const [overwrite, setOverwrite] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const headers = rows?.[0] ?? [];

  // Add up label costs per eBay order number (an order can have several labels).
  const matches = useMemo(() => {
    const totals = new Map<string, number>();
    let unmatched = 0;
    for (const row of rows?.slice(1) ?? []) {
      const id = (row[orderCol] ?? "").match(ORDER_NUMBER)?.[0];
      const cost = Number((row[costCol] ?? "").replace(/[$,\s]/g, ""));
      if (!id || !Number.isFinite(cost) || cost < 0) continue;
      if (!knownOrderIds.has(id)) {
        unmatched++;
        continue;
      }
      totals.set(id, (totals.get(id) ?? 0) + cost);
    }
    return { totals, unmatched };
  }, [rows, orderCol, costCol, knownOrderIds]);

  const total = [...matches.totals.values()].reduce((sum, cost) => sum + cost, 0);

  async function readFile(file: File) {
    const parsed = parseCsv(await file.text());
    setFileName(file.name);
    setRows(parsed);
    const head = parsed[0] ?? [];
    setOrderCol(guessColumn(head, ["order"]));
    setCostCol(guessColumn(head, ["cost", "total", "postage", "rate", "amount", "price"]));
    setState("idle");
    setMessage("");
  }

  async function apply() {
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/orders/shipping-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [...matches.totals].map(([ebayOrderId, cost]) => ({ ebayOrderId, cost })),
          overwrite,
        }),
      });
      const data: { success?: boolean; updated?: number; error?: string } = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Couldn't import shipping costs.");
      await onImported();
      setState("done");
      setMessage(`Updated shipping on ${data.updated ?? 0} order${data.updated === 1 ? "" : "s"}.`);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Couldn't import shipping costs.");
    }
  }

  const select = "w-full rounded-lg border border-white/10 bg-[#0b1120] px-3 py-2 text-sm text-white outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Import shipping costs">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151d2d] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Import shipping costs</h3>
            <p className="mt-1 text-sm text-slate-400">
              Upload a spreadsheet of your labels (for example Pirate Ship → Reports → export as CSV).
              Rows are matched to your eBay orders by order number.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Close">✕</button>
        </div>

        {!enabled ? (
          <p className="mt-5 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Shipping costs need a one-time database update first (docs/sql/2026-11-07_shipping_cost.sql).
          </p>
        ) : (
          <>
            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-400 transition hover:border-blue-500/50">
              <span className="font-semibold text-blue-400">{fileName || "Choose a CSV file"}</span>
              <span className="mt-1 text-xs">{rows ? `${Math.max(0, rows.length - 1)} rows found` : "From Pirate Ship, USPS.com, PayPal…"}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </label>

            {rows && headers.length > 0 && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-400">
                    Column with the eBay order number
                    <select value={orderCol} onChange={(e) => setOrderCol(Number(e.target.value))} className={`mt-1 ${select}`}>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Column with what the label cost
                    <select value={costCol} onChange={(e) => setCostCol(Number(e.target.value))} className={`mt-1 ${select}`}>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                </div>

                <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
                  {matches.totals.size > 0 ? (
                    <p className="text-slate-200">
                      <span className="font-semibold text-emerald-400">{matches.totals.size} orders matched</span> · {money(total)} in shipping
                    </p>
                  ) : (
                    <p className="text-amber-300">No rows matched your orders. Check the two columns above.</p>
                  )}
                  {matches.unmatched > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {matches.unmatched} row{matches.unmatched === 1 ? "" : "s"} had an order number that isn&apos;t in this store (skipped).
                    </p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-blue-500" />
                  Replace shipping costs already entered on those orders
                </label>
              </div>
            )}
          </>
        )}

        {message && (
          <p className={`mt-4 text-sm ${state === "error" ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">
            {state === "done" ? "Done" : "Cancel"}
          </button>
          {enabled && state !== "done" && (
            <button
              type="button"
              onClick={() => void apply()}
              disabled={matches.totals.size === 0 || state === "saving"}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {state === "saving" ? "Importing…" : `Import ${matches.totals.size || ""} shipping cost${matches.totals.size === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProTag() {
  return (
    <span className="ml-0.5 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-300">
      Pro
    </span>
  );
}

// The two buttons shown on the Orders page.
export default function OrderTools({
  orders,
  periodLabel,
  shippingEnabled,
  onImported,
  allowed = true,
  onUpgrade,
}: {
  orders: ToolOrder[];
  periodLabel: string;
  shippingEnabled: boolean;
  onImported: () => Promise<void>;
  // False on the Free plan: the buttons show a Pro tag and open the plans page.
  allowed?: boolean;
  onUpgrade?: () => void;
}) {
  const [importing, setImporting] = useState(false);
  const knownOrderIds = useMemo(
    () => new Set(orders.map((o) => o.ebayOrderId).filter((id): id is string => Boolean(id))),
    [orders]
  );
  const button =
    "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1120] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-blue-500/40 hover:text-white disabled:opacity-50";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => (allowed ? downloadCsv(orders, periodLabel) : onUpgrade?.())}
        disabled={allowed && orders.length === 0}
        className={button}
        title="Spreadsheet of the orders in this date range, for taxes or your accountant"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        Download CSV{!allowed && <ProTag />}
      </button>
      <button type="button" onClick={() => (allowed ? setImporting(true) : onUpgrade?.())} className={button} title="Fill in label costs from a Pirate Ship (or similar) spreadsheet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>
        Import shipping costs{!allowed && <ProTag />}
      </button>
      {importing && (
        <ShippingImport
          knownOrderIds={knownOrderIds}
          enabled={shippingEnabled}
          onClose={() => setImporting(false)}
          onImported={onImported}
        />
      )}
    </div>
  );
}
