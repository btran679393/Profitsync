"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Checkbox, Field, Menu, Modal, Notice, Select } from "@/components/ui";
import ReconcileDialog from "./ReconcileDialog";

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

  return (
    <Modal
      open
      onClose={onClose}
      title="Import shipping costs"
      description="Upload a spreadsheet of your labels (for example Pirate Ship → Reports → export as CSV). Rows are matched to your orders by eBay order number."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {state === "done" ? "Done" : "Cancel"}
          </Button>
          {enabled && state !== "done" && (
            <Button variant="primary" onClick={() => void apply()} disabled={matches.totals.size === 0} loading={state === "saving"}>
              {`Import ${matches.totals.size || ""} shipping cost${matches.totals.size === 1 ? "" : "s"}`}
            </Button>
          )}
        </>
      }
    >
      {!enabled ? (
        <Notice tone="warn">Importing shipping costs isn&apos;t available yet. Please try again later.</Notice>
      ) : (
        <>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-7 text-center text-sm text-muted transition-colors hover:border-accent/50 focus-within:border-accent">
            <span className="font-semibold text-accent-ink">{fileName || "Choose a CSV file"}</span>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Column with the eBay order number">
                  <Select value={orderCol} onChange={(e) => setOrderCol(Number(e.target.value))}>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </Select>
                </Field>
                <Field label="Column with what the label cost">
                  <Select value={costCol} onChange={(e) => setCostCol(Number(e.target.value))}>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </Select>
                </Field>
              </div>

              <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                {matches.totals.size > 0 ? (
                  <p className="text-ink-2">
                    <span className="font-semibold text-profit">{matches.totals.size} orders matched</span> · <span className="ps-num">{money(total)}</span> in shipping
                  </p>
                ) : (
                  <p className="text-warn">No rows matched your orders. Check the two columns above.</p>
                )}
                {matches.unmatched > 0 && (
                  <p className="mt-1 text-xs text-subtle">
                    {matches.unmatched} row{matches.unmatched === 1 ? "" : "s"} had an order number that isn&apos;t in this store (skipped).
                  </p>
                )}
              </div>

              <Checkbox checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} label="Replace shipping costs already entered on those orders" />
            </div>
          )}
        </>
      )}

      {message && <p className={`mt-4 text-sm ${state === "error" ? "text-loss" : "text-profit"}`}>{message}</p>}
    </Modal>
  );
}

export function ProTag() {
  return <Badge tone="accent">Pro</Badge>;
}

// The two buttons shown on the Orders page.
export default function OrderTools({
  orders,
  periodLabel,
  shippingEnabled,
  onImported,
  allowed = true,
  onUpgrade,
  onSync,
}: {
  orders: ToolOrder[];
  periodLabel: string;
  shippingEnabled: boolean;
  onImported: () => Promise<void>;
  // False on the Free plan: the buttons show a Pro tag and open the plans page.
  allowed?: boolean;
  onUpgrade?: () => void;
  // Lets "Check against eBay" offer a sync when something doesn't match.
  onSync?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const knownOrderIds = useMemo(
    () => new Set(orders.map((o) => o.ebayOrderId).filter((id): id is string => Boolean(id))),
    [orders]
  );
  return (
    <>
      <Menu
        label="Import and export"
        trigger={({ toggle, ...aria }) => (
          <Button
            size="md"
            variant="secondary"
            onClick={toggle}
            {...aria}
            iconRight={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            }
          >
            Import / export
          </Button>
        )}
        items={[
          {
            label: "Check against eBay",
            hint: "Compare a month with eBay's own payment records",
            onSelect: () => setChecking(true),
          },
          {
            label: "Download CSV",
            hint: `Orders in ${periodLabel.toLowerCase()}, for taxes or your accountant`,
            badge: allowed ? undefined : <ProTag />,
            disabled: allowed && orders.length === 0,
            onSelect: () => (allowed ? downloadCsv(orders, periodLabel) : onUpgrade?.()),
          },
          {
            label: "Import shipping costs",
            hint: "From a Pirate Ship (or similar) spreadsheet",
            badge: allowed ? undefined : <ProTag />,
            onSelect: () => (allowed ? setImporting(true) : onUpgrade?.()),
          },
        ]}
      />
      <ReconcileDialog open={checking} onClose={() => setChecking(false)} onSync={onSync} />
      {importing && (
        <ShippingImport
          knownOrderIds={knownOrderIds}
          enabled={shippingEnabled}
          onClose={() => setImporting(false)}
          onImported={onImported}
        />
      )}
    </>
  );
}
