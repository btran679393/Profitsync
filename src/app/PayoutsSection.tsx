"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Drawer,
  EmptyState,
  LoadingRegion,
  Notice,
  SegmentedControl,
  Skeleton,
  StatCard,
  buttonClasses,
  cn,
} from "@/components/ui";
import {
  LINE_TEXT,
  PAYOUT_RANGES,
  payoutsCsv,
  statusText,
  type Payout,
  type PayoutBreakdown,
  type PayoutLine,
  type PayoutsResponse,
} from "@/lib/ebay/payouts";
import { toCsv } from "@/lib/taxReport";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const signed = (value: number) => (value < 0 ? `−${money(Math.abs(value))}` : money(value));

function shortDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function bankText(p: Pick<Payout, "bankName" | "bankLast4">) {
  if (!p.bankName && !p.bankLast4) return "Your bank";
  return [p.bankName ?? "Bank", p.bankLast4 ? `••${p.bankLast4}` : null].filter(Boolean).join(" ");
}

type RangeDays = `${(typeof PAYOUT_RANGES)[number]["days"]}`;

async function fetchPayouts(days: string): Promise<{ data: PayoutsResponse | null; error: { message: string; reconnect: boolean } | null }> {
  try {
    const response = await fetch(`/api/ebay/payouts?days=${days}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { data: null, error: { message: body.error ?? "Couldn't load your payouts.", reconnect: Boolean(body.reconnect) } };
    return { data: body as PayoutsResponse, error: null };
  } catch {
    return { data: null, error: { message: "Couldn't reach ProfitSync. Check your connection and try again.", reconnect: false } };
  }
}

// Payouts: money on its way to the seller's bank, money still waiting at
// eBay, and what each payout was made of. Read straight from eBay.
export default function PayoutsSection({
  storeKey,
  hasStore,
  multiStore,
  reconnectHref = "/api/ebay/auth",
  canExport = true,
  onUpgrade,
  businessName = "",
}: {
  // Changes when the seller switches store, so the page reloads.
  storeKey: string;
  hasStore: boolean;
  // "All stores" view: show which store each payout came from.
  multiStore: boolean;
  reconnectHref?: string;
  // Spreadsheet downloads are part of Pro and Ultimate.
  canExport?: boolean;
  onUpgrade?: () => void;
  // Shown at the top of the spreadsheet and in its file name.
  businessName?: string;
}) {
  const [days, setDays] = useState<RangeDays>("90");
  const [refreshes, setRefreshes] = useState(0);
  // What's on screen and which request it came from; "loading" means the
  // latest request hasn't answered yet.
  const [result, setResult] = useState<{ key: string; data: PayoutsResponse | null; error: { message: string; reconnect: boolean } | null }>({
    key: "",
    data: null,
    error: null,
  });
  const [open, setOpen] = useState<Payout | null>(null);
  const requestKey = `${days}|${storeKey}|${refreshes}`;
  const loading = hasStore && result.key !== requestKey;
  const data = result.data;
  const error = loading ? null : result.error;
  const load = () => setRefreshes((n) => n + 1);

  function downloadCsv() {
    if (!data) return;
    const text = payoutsCsv(data.payouts, { business: businessName, from: data.from, to: data.to }, toCsv);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ProfitSync payouts ${data.from.slice(0, 10)} to ${data.to.slice(0, 10)}${businessName ? ` - ${businessName.replace(/[\\/:*?"<>|]+/g, "")}` : ""}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => {
    if (!hasStore) return;
    let active = true;
    fetchPayouts(days).then((answer) => {
      if (active) setResult((previous) => ({ key: requestKey, data: answer.data ?? (answer.error ? null : previous.data), error: answer.error }));
    });
    return () => {
      active = false;
    };
  }, [days, hasStore, requestKey]);

  const stats = useMemo(() => {
    const payouts = data?.payouts ?? [];
    const paid = payouts.filter((p) => p.status === "SUCCEEDED");
    const onTheWay = payouts.filter((p) => p.status === "INITIATED");
    const problems = payouts.filter((p) => ["RETRYABLE_FAILED", "TERMINAL_FAILED", "REVERSED"].includes(p.status));
    const paidTotal = paid.reduce((sum, p) => sum + p.amount, 0);
    // Average days between paid payouts, to say roughly how often money comes.
    const dates = paid.map((p) => (p.date ? Date.parse(p.date) : NaN)).filter(Number.isFinite).sort((a, b) => a - b);
    const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86_400_000);
    const everyDays = gaps.length >= 2 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
    return {
      paid,
      paidTotal,
      onTheWay,
      onTheWayTotal: onTheWay.reduce((sum, p) => sum + p.amount, 0),
      problems,
      lastPaid: paid[0] ?? null,
      everyDays,
    };
  }, [data]);

  const rangeLabel = PAYOUT_RANGES.find((r) => String(r.days) === days)?.label.toLowerCase() ?? `${days} days`;

  if (!hasStore) {
    return (
      <Card>
        <EmptyState
          title="Connect your eBay store"
          description="Your payouts, money waiting at eBay and what each payout was made of will show here."
          action={
            <a href={reconnectHref} className={buttonClasses("primary", "md")}>
              Connect eBay
            </a>
          }
        />
      </Card>
    );
  }

  const funds = data?.funds;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Payouts from"
          value={days}
          onChange={setDays}
          options={PAYOUT_RANGES.map((r) => ({ value: String(r.days) as RangeDays, label: r.label }))}
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => (canExport ? downloadCsv() : onUpgrade?.())}
            disabled={canExport && (!data || data.payouts.length === 0)}
            title={canExport ? "A spreadsheet of these payouts for your bookkeeping" : "Spreadsheet downloads come with Pro and Ultimate"}
          >
            Download CSV
          </Button>
          <Button variant="secondary" onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Notice
          tone={error.reconnect ? "warn" : "loss"}
          title={error.reconnect ? "eBay needs your OK" : "Payouts didn't load"}
          action={
            error.reconnect ? (
              <a href={reconnectHref} className={buttonClasses("primary", "sm")}>
                Reconnect eBay
              </a>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            )
          }
        >
          {error.message}
        </Notice>
      )}

      {data && data.reconnect.length > 0 && (
        <Notice
          tone="warn"
          title={`Reconnect ${data.reconnect.join(", ")}`}
          action={
            <a href={reconnectHref} className={buttonClasses("primary", "sm")}>
              Reconnect eBay
            </a>
          }
        >
          eBay sign-in expired, so payouts from {data.reconnect.length === 1 ? "this store" : "these stores"} aren&apos;t shown.
        </Notice>
      )}

      {stats.problems.length > 0 && (
        <Notice tone="loss" title={`${stats.problems.length} payout${stats.problems.length === 1 ? "" : "s"} didn't reach your bank`}>
          {statusText(stats.problems[0].status).help} Click the payout below to see what was in it.
        </Notice>
      )}

      {/* Money waiting at eBay */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Ready for payout"
          loading={loading && !data}
          tone={funds && funds.available > 0 ? "profit" : "neutral"}
          value={funds ? money(funds.available) : "—"}
          note="Goes out with your next eBay payout"
        />
        <StatCard
          label="Processing"
          loading={loading && !data}
          value={funds ? money(funds.processing) : "—"}
          note="From recent sales, not released yet"
        />
        <StatCard
          label="On hold"
          loading={loading && !data}
          tone={funds && funds.onHold > 0 ? "loss" : "neutral"}
          value={funds ? money(funds.onHold) : "—"}
          note={funds && funds.onHold > 0 ? "Held by eBay. See Seller Hub → Payments" : "Nothing held by eBay"}
        />
        <StatCard
          label="Paid to your bank"
          loading={loading && !data}
          value={data ? money(stats.paidTotal) : "—"}
          note={
            data
              ? `${stats.paid.length} payout${stats.paid.length === 1 ? "" : "s"} in the last ${rangeLabel}${stats.everyDays ? ` · about every ${stats.everyDays} day${stats.everyDays === 1 ? "" : "s"}` : ""}`
              : `Last ${rangeLabel}`
          }
        />
      </div>

      {stats.onTheWay.length > 0 && (
        <Notice tone="accent" title={`${money(stats.onTheWayTotal)} on its way to your bank`}>
          {stats.onTheWay.length === 1 ? "1 payout has" : `${stats.onTheWay.length} payouts have`} been sent by eBay. Banks usually show it within
          1–3 business days.
        </Notice>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Payouts"
          description={
            stats.lastPaid
              ? `Last paid ${shortDate(stats.lastPaid.date)}: ${money(stats.lastPaid.amount)}. Click a payout to see the sales and fees inside it.`
              : "Click a payout to see the sales and fees inside it."
          }
        />
        <CardBody className="p-0 pt-4">
          {loading && !data ? (
            <LoadingRegion label="Loading payouts">
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </LoadingRegion>
          ) : !data || data.payouts.length === 0 ? (
            <EmptyState
              title="No payouts in this period"
              description={error ? "Fix the problem above, then try again." : `eBay hasn't sent any payouts in the last ${rangeLabel}. Try a longer period.`}
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.payouts.map((p) => {
                const status = statusText(p.status);
                return (
                  <li key={`${p.storeId}-${p.id}`}>
                    <button
                      type="button"
                      onClick={() => setOpen(p)}
                      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="ps-num text-sm font-medium text-ink">{shortDate(p.date)}</span>
                          <Badge tone={status.tone}>
                            <span title={status.help}>{status.label}</span>
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-subtle">
                          {bankText(p)}
                          {p.transactionCount !== null && ` · ${p.transactionCount} item${p.transactionCount === 1 ? "" : "s"}`}
                          {multiStore && p.storeName && ` · ${p.storeName}`}
                        </p>
                      </div>
                      <span className={cn("ps-num text-right text-base font-semibold", p.status === "SUCCEEDED" ? "text-ink" : status.tone === "loss" ? "text-loss" : "text-ink-2")}>
                        {money(p.amount)}
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-subtle" aria-hidden="true">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-subtle">
        From eBay&apos;s payment records, read when you open this page. eBay decides when payouts go out (daily or weekly, set in Seller Hub →
        Payments).
      </p>

      <PayoutDrawer key={open ? `${open.storeId}:${open.id}` : "none"} payout={open} onClose={() => setOpen(null)} />
    </div>
  );
}

type Details = { lines: PayoutLine[]; breakdown: PayoutBreakdown; titles: Record<string, string> };

// Opened fresh for each payout (the parent gives it a key per payout).
function PayoutDrawer({ payout, onClose }: { payout: Payout | null; onClose: () => void }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!payout) return;
    let active = true;
    fetch(`/api/ebay/payouts?${new URLSearchParams({ payout: payout.id, store: payout.storeId })}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) setError(body.error ?? "Couldn't load this payout.");
        else setDetails(body as Details);
      })
      .catch(() => {
        if (active) setError("Couldn't reach ProfitSync. Try again.");
      });
    return () => {
      active = false;
    };
  }, [payout]);

  if (!payout) return null;
  const status = statusText(payout.status);
  const b = details?.breakdown;
  const rows: Array<[string, number]> = b
    ? (
        [
          ["Sales", b.sales],
          ["eBay selling fees", b.fees],
          ["Refunds", b.refunds],
          ["Shipping labels", b.labels],
          ["Other eBay charges", b.otherCharges],
          ["Disputes", b.disputes],
          ["Other", b.other],
        ] as Array<[string, number]>
      ).filter(([, v], i) => i === 0 || Math.abs(v) >= 0.005)
    : [];
  const gap = b ? Math.round((payout.amount - b.net) * 100) / 100 : 0;

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={`${money(payout.amount)} payout`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {shortDate(payout.date)} · {bankText(payout)} <Badge tone={status.tone}>{status.label}</Badge>
        </span>
      }
    >
      {status.help && <p className="mb-5 text-sm text-muted">{status.help}</p>}
      {error ? (
        <Notice tone="loss">{error}</Notice>
      ) : !details ? (
        <LoadingRegion label="Loading payout details">
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </LoadingRegion>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Where this payout came from</h3>
            <dl className="divide-y divide-line rounded-lg border border-line text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3.5 py-2">
                  <dt className="text-muted">{label}</dt>
                  <dd className={cn("ps-num", value < 0 ? "text-loss" : "text-ink")}>{signed(value)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between bg-surface-2/60 px-3.5 py-2.5 font-semibold">
                <dt className="text-ink">Paid to your bank</dt>
                <dd className="ps-num text-ink">{money(payout.amount)}</dd>
              </div>
            </dl>
            {Math.abs(gap) >= 0.01 && (
              <p className="mt-2 text-xs text-subtle">
                eBay&apos;s records for this payout add up to {money(b!.net)}, {money(Math.abs(gap))} {gap > 0 ? "less" : "more"} than the
                payout. Money held back or released from earlier payouts can cause this.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              {details.lines.length} item{details.lines.length === 1 ? "" : "s"} in this payout
            </h3>
            {details.lines.length === 0 ? (
              <p className="text-sm text-muted">eBay didn&apos;t list the items for this payout.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {details.lines.map((line) => {
                  const title = line.orderId ? details.titles[line.orderId] : undefined;
                  return (
                    <li key={line.id} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ink" title={title ?? line.memo ?? undefined}>
                          {title ?? line.memo ?? LINE_TEXT[line.kind]}
                        </p>
                        <p className="mt-0.5 text-xs text-subtle">
                          {LINE_TEXT[line.kind]} · {shortDate(line.date)}
                          {line.orderId && <span className="ps-num"> · Order {line.orderId}</span>}
                          {line.kind === "sale" && line.fees > 0 && <span> · {money(line.fees)} fees taken</span>}
                        </p>
                      </div>
                      <span className={cn("ps-num shrink-0 font-medium", line.net < 0 ? "text-loss" : "text-ink")}>{signed(line.net)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="ps-num text-xs text-subtle">eBay payout ID {payout.id}</p>
        </div>
      )}
    </Drawer>
  );
}
