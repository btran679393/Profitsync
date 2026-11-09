"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, LoadingRegion, Modal, Notice, Select, Skeleton, buttonClasses, cn } from "@/components/ui";
import type { Issue, IssueKind, ReconcileResult } from "@/lib/reconcile";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const KIND_TEXT: Record<IssueKind, { title: string; fix: string }> = {
  missing_in_profitsync: {
    title: "On eBay, not in ProfitSync",
    fix: "Press Sync to bring it in. On the Free plan, orders over the monthly limit aren't imported.",
  },
  missing_on_ebay: {
    title: "In ProfitSync, no eBay payment yet",
    fix: "Usually an unpaid, cancelled or very recent order. Check it on eBay.",
  },
  fees_differ: { title: "eBay fees differ", fix: "eBay may have adjusted the fee since your last sync. Sync again to update it." },
  sale_differs: { title: "Sale amount differs", fix: "Sync again to update it. If it still differs, check the order on eBay." },
  refund_missing: { title: "Refund not in ProfitSync", fix: "eBay refunded this order. Sync again to bring the refund in." },
};

function lastMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + (i === 0 ? " (so far)" : ""),
    };
  });
}

type Response = ReconcileResult & { month: string; error?: string; reconnect?: boolean };

// "Check against eBay": one month of ProfitSync vs eBay's payment records.
export default function ReconcileDialog({ open, onClose, onSync }: { open: boolean; onClose: () => void; onSync?: () => void }) {
  const [months] = useState(() => lastMonths(12));
  const [month, setMonth] = useState(months[1]?.value ?? months[0].value);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error" | "reconnect">("idle");
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");

  const run = useCallback(async (which: string) => {
    setState("loading");
    setError("");
    try {
      const response = await fetch(`/api/ebay/reconcile?month=${which}`, { cache: "no-store" });
      const body = (await response.json()) as Response;
      if (response.status === 401 && body.reconnect) {
        setState("reconnect");
        return;
      }
      if (!response.ok) throw new Error(body.error || "Couldn't compare with eBay.");
      setData(body);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compare with eBay.");
      setState("error");
    }
  }, []);

  // Check straight away when opened, and whenever the month changes.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void run(month), 0);
    return () => window.clearTimeout(id);
  }, [open, month, run]);

  const rows: Array<{ label: string; mine: number; theirs: number; isMoney: boolean }> = data
    ? [
        { label: "Orders", mine: data.profitsync.orders, theirs: data.ebay.orders, isMoney: false },
        { label: "Sales (before fees, without sales tax)", mine: data.profitsync.salesCents, theirs: data.ebay.salesCents, isMoney: true },
        { label: "eBay fees", mine: data.profitsync.feesCents, theirs: data.ebay.feesCents, isMoney: true },
        { label: "Refunds", mine: data.profitsync.refundsCents, theirs: data.ebay.refundsCents, isMoney: true },
      ]
    : [];
  const allMatch = data !== null && data.issues.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Check against eBay"
      description="Compares a month in ProfitSync with eBay's own payment records for the store you're viewing. Nothing is changed."
      footer={
        <>
          {data && data.issues.length > 0 && onSync && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onSync();
              }}
            >
              Sync now
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-64">
          <span className="mb-1.5 block text-xs font-medium text-ink-2">Month</span>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} disabled={state === "loading"}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </label>
        <Button variant="secondary" onClick={() => void run(month)} loading={state === "loading"}>
          Check again
        </Button>
      </div>

      <div className="mt-5">
        {state === "loading" && (
          <LoadingRegion label="Checking with eBay">
            <p className="mb-3 text-sm text-muted">Reading eBay&apos;s payment records…</p>
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          </LoadingRegion>
        )}

        {state === "reconnect" && (
          <Notice
            tone="warn"
            title="eBay needs you to sign in again"
            action={
              <a href="/api/ebay/auth" className={buttonClasses("primary", "sm")}>
                Reconnect eBay
              </a>
            }
          >
            Your eBay connection has expired. Reconnecting keeps all your data.
          </Notice>
        )}

        {state === "error" && <Notice tone="loss">{error}</Notice>}

        {state === "done" && data && (
          <>
            <div
              role="status"
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3",
                allMatch ? "border-profit/30 bg-profit-soft" : "border-warn/30 bg-warn-soft"
              )}
            >
              <span className={cn("text-lg font-semibold", allMatch ? "text-profit" : "text-warn")} aria-hidden="true">
                {allMatch ? "✓" : "!"}
              </span>
              <p className="text-sm text-ink">
                {allMatch ? (
                  <>
                    <span className="font-semibold">Everything matches eBay.</span> {data.matched} order{data.matched === 1 ? "" : "s"} checked.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">
                      {data.issues.length} thing{data.issues.length === 1 ? " doesn't" : "s don't"} match.
                    </span>{" "}
                    {data.matched} order{data.matched === 1 ? "" : "s"} matched exactly.
                  </>
                )}
              </p>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium"></th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">ProfitSync</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">eBay</th>
                    <th scope="col" className="w-10 px-4 py-2.5"><span className="sr-only">Match</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => {
                    const same = Math.abs(row.mine - row.theirs) <= (row.isMoney ? 2 : 0);
                    return (
                      <tr key={row.label}>
                        <td className="px-4 py-2.5 text-ink-2">{row.label}</td>
                        <td className="ps-num px-4 py-2.5 text-right font-medium text-ink">{row.isMoney ? money(row.mine) : row.mine}</td>
                        <td className="ps-num px-4 py-2.5 text-right font-medium text-ink">{row.isMoney ? money(row.theirs) : row.theirs}</td>
                        <td className="px-4 py-2.5 text-center">
                          {same ? <span className="text-profit" aria-label="Matches">✓</span> : <span className="font-semibold text-warn" aria-label="Differs">!</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.issues.length > 0 && (
              <ul className="mt-4 space-y-2">
                {data.issues.map((issue: Issue) => (
                  <li key={issue.kind + issue.orderId} className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warn">{KIND_TEXT[issue.kind].title}</Badge>
                      <span className="ps-num text-xs text-subtle">Order #{issue.orderId}</span>
                    </div>
                    {issue.item && <p className="mt-1 truncate text-sm text-ink">{issue.item}</p>}
                    <p className="ps-num mt-1 text-xs text-muted">
                      {issue.profitsyncCents !== null && <>ProfitSync {money(issue.profitsyncCents)}</>}
                      {issue.profitsyncCents !== null && issue.ebayCents !== null && " · "}
                      {issue.ebayCents !== null && <>eBay {money(issue.ebayCents)}</>}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{KIND_TEXT[issue.kind].fix}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
