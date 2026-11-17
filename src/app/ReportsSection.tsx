"use client";

import { useMemo, useState } from "react";
import { Badge, Card, CardBody, CardHeader, EmptyState, SegmentedControl, StatCard, cn } from "@/components/ui";
import type { ApiListing, Order } from "./dashboard/model";
import {
  NOT_KNOWN,
  bestAndWorst,
  monthKey,
  monthLabel,
  monthlyReport,
  profitBy,
  repeatBuyers,
  type GroupRow,
  type MonthRow,
} from "@/lib/reports";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const money0 = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function shortDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Span = "12" | "24";

// Reports: how the business is doing over time. Months, categories,
// brands and repeat buyers, for the store (or all stores) being viewed.
export default function ReportsSection({
  orders,
  listings,
  expenses,
  now,
  loading,
  onGoOrders,
  onRefreshListings,
}: {
  orders: Order[];
  listings: ApiListing[];
  expenses: Array<{ date: string; amount: string | number }>;
  now: Date | null;
  loading: boolean;
  onGoOrders: () => void;
  onRefreshListings: () => void;
}) {
  const [span, setSpan] = useState<Span>("12");
  const [groupBy, setGroupBy] = useState<"categoryName" | "brand">("categoryName");

  const months = useMemo(() => (now ? monthlyReport(orders, expenses, Number(span), now) : []), [orders, expenses, span, now]);
  const summary = useMemo(() => bestAndWorst(months), [months]);

  // Orders inside the chosen span, for categories, brands and buyers.
  const spanOrders = useMemo(() => {
    if (!months.length) return [];
    const first = months[0].key;
    return orders.filter((o) => o.orderDate && monthKey(new Date(o.orderDate)) >= first);
  }, [orders, months]);
  const groups = useMemo(() => profitBy(spanOrders, listings, groupBy), [spanOrders, listings, groupBy]);
  const buyers = useMemo(() => repeatBuyers(spanOrders), [spanOrders]);

  const missingCost = months.reduce((sum, m) => sum + m.missingCost, 0);
  const thisMonth = months[months.length - 1];
  const sameMonthLastYear = span === "24" && months.length >= 13 ? months[months.length - 13] : null;
  const allUnknown = groups.length > 0 && groups.every((g) => g.name === NOT_KNOWN);

  if (!loading && orders.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Your reports appear once you have orders"
          description="Sync your eBay orders and add what you paid for your items. Reports then show your best months, what sells best and who buys again."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Report period"
          value={span}
          onChange={setSpan}
          options={[
            { value: "12", label: "Last 12 months" },
            { value: "24", label: "Last 24 months" },
          ]}
        />
        {missingCost > 0 && (
          <p className="text-sm text-muted">
            {missingCost} order{missingCost === 1 ? "" : "s"} still need{missingCost === 1 ? "s" : ""} a product cost, so profit is missing for{" "}
            {missingCost === 1 ? "it" : "them"}.{" "}
            <button type="button" onClick={onGoOrders} className="font-medium text-accent-ink hover:underline">
              Add costs
            </button>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Best month"
          loading={loading}
          tone="profit"
          value={summary.best ? money(summary.best.profit) : "—"}
          note={summary.best ? `${monthLabel(summary.best.key)} · ${summary.best.orders} orders` : "No sales yet"}
        />
        <StatCard
          label="Slowest month"
          loading={loading}
          tone={summary.worst && summary.worst.profit < 0 ? "loss" : "neutral"}
          value={summary.worst ? money(summary.worst.profit) : "—"}
          note={summary.worst ? `${monthLabel(summary.worst.key)} · ${summary.worst.orders} orders` : "Needs two months of sales"}
        />
        <StatCard
          label="Average month"
          loading={loading}
          value={money(summary.average)}
          note="Profit, across months with sales"
        />
        <StatCard
          label={thisMonth ? `${monthLabel(thisMonth.key).split(" ")[0]} so far` : "This month"}
          loading={loading}
          tone={thisMonth && thisMonth.profit < 0 ? "loss" : "neutral"}
          value={thisMonth ? money(thisMonth.profit) : "—"}
          note={
            sameMonthLastYear
              ? `${money(sameMonthLastYear.profit)} in ${monthLabel(sameMonthLastYear.key)}`
              : thisMonth
                ? `${money(thisMonth.sales)} in sales`
                : ""
          }
        />
      </div>

      <MonthChart months={months} best={summary.best?.key ?? null} worst={summary.worst?.key ?? null} />

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader
            title="What sells best"
            description="Profit by eBay category or by brand, from the details on your listings."
            actions={
              <SegmentedControl
                label="Group by"
                size="sm"
                value={groupBy}
                onChange={setGroupBy}
                options={[
                  { value: "categoryName", label: "Category" },
                  { value: "brand", label: "Brand" },
                ]}
              />
            }
          />
          <CardBody>
            {allUnknown ? (
              <div className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-muted">
                <p className="font-medium text-ink">Categories and brands are on their way</p>
                <p className="mt-1">
                  ProfitSync reads them from eBay when you refresh your listings, a few dozen at a time.{" "}
                  <button type="button" onClick={onRefreshListings} className="font-medium text-accent-ink hover:underline">
                    Refresh listings now
                  </button>
                </p>
              </div>
            ) : (
              <GroupTable rows={groups} />
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Repeat buyers" description="People who bought from you more than once in this period." />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Buyers" value={buyers.buyers.toLocaleString("en-US")} />
              <MiniStat label="Came back" value={buyers.repeatBuyers.toLocaleString("en-US")} />
              <MiniStat label="Of your sales" value={buyers.repeatSalesShare === null ? "—" : `${buyers.repeatSalesShare}%`} />
            </div>
            {buyers.top.length === 0 ? (
              <p className="text-sm text-muted">No repeat buyers in this period yet. Fast shipping and a thank-you note bring people back.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {buyers.top.map((b) => (
                  <li key={b.buyer} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{b.buyer}</p>
                      <p className="text-xs text-subtle">Last order {shortDate(b.lastOrder)}</p>
                    </div>
                    <div className="text-right">
                      <p className="ps-num font-medium text-ink">{b.orders} orders</p>
                      <p className="ps-num text-xs text-subtle">{money(b.spent)} spent</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="text-xs text-subtle">
        Profit uses the same rules as the rest of ProfitSync: after eBay fees, shipping, product costs, refund losses and, for months, that
        month&apos;s expenses. Orders without a product cost count toward sales but not profit.
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 px-2 py-2.5">
      <p className="ps-num text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// Profit per month as bars (green above zero, red below), with a table.
function MonthChart({ months, best, worst }: { months: MonthRow[]; best: string | null; worst: string | null }) {
  const [showTable, setShowTable] = useState(false);
  const top = Math.max(1, ...months.map((m) => Math.max(0, m.profit)));
  const bottom = Math.max(0, ...months.map((m) => Math.max(0, -m.profit)));
  const range = top + bottom;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Month by month"
        description="Profit each month after costs and expenses."
        actions={
          <button type="button" onClick={() => setShowTable((v) => !v)} className="text-sm font-medium text-accent-ink hover:underline">
            {showTable ? "Show chart" : "Show as a table"}
          </button>
        }
      />
      <CardBody>
        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:py-2 [&>th]:font-medium">
                  <th>Month</th>
                  <th className="text-right">Sales</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Margin</th>
                  <th className="text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {[...months].reverse().map((m) => (
                  <tr key={m.key} className="[&>td]:border-b [&>td]:border-line [&>td]:py-2">
                    <td className="text-ink">
                      {monthLabel(m.key)}{" "}
                      {m.key === best && <Badge tone="profit">Best</Badge>}
                      {m.key === worst && <Badge tone="neutral">Slowest</Badge>}
                    </td>
                    <td className="ps-num text-right text-ink-2">{money(m.sales)}</td>
                    <td className={cn("ps-num text-right font-medium", m.profit < 0 ? "text-loss" : "text-ink")}>{money(m.profit)}</td>
                    <td className="ps-num text-right text-muted">{m.margin === null ? "—" : `${m.margin}%`}</td>
                    <td className="ps-num text-right text-muted">{m.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div className="flex h-48 items-stretch gap-1 sm:gap-1.5" role="img" aria-label="Profit by month">
              {months.map((m) => {
                const up = (Math.max(0, m.profit) / range) * 100;
                const down = (Math.max(0, -m.profit) / range) * 100;
                return (
                  <div key={m.key} className="group relative flex min-w-0 flex-1 flex-col" title={`${monthLabel(m.key)}: ${money(m.profit)} profit on ${money(m.sales)} sales`}>
                    <div className="flex flex-col justify-end" style={{ height: `${(top / range) * 100}%` }}>
                      <div
                        className={cn("rounded-t-sm transition-opacity group-hover:opacity-80", m.key === best ? "bg-profit" : "bg-accent/70")}
                        style={{ height: `${m.profit > 0 ? Math.max(up / (top / range), 1) : 0}%` }}
                      />
                    </div>
                    <div className="border-t border-line-strong" />
                    {bottom > 0 && (
                      <div style={{ height: `${(bottom / range) * 100}%` }}>
                        {down > 0 && <div className="rounded-b-sm bg-loss/80" style={{ height: `${(down / (bottom / range)) }%` }} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1 sm:gap-1.5">
              {months.map((m, i) => (
                <span key={m.key} className={cn("min-w-0 flex-1 overflow-hidden text-center text-[10px] text-subtle", months.length > 12 && i % 2 === 1 && "invisible sm:visible")}>
                  <span className="sm:hidden">{monthLabel(m.key).slice(0, 3)}</span>
                  <span className="hidden whitespace-nowrap sm:inline">{monthLabel(m.key, true)}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-subtle">
              Highest bar {best ? `${monthLabel(best)} (${money0(months.find((m) => m.key === best)?.profit ?? 0)})` : "—"}. Hover a bar for the numbers, or
              show it as a table.
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function GroupTable({ rows }: { rows: GroupRow[] }) {
  const maxProfit = Math.max(1, ...rows.map((r) => Math.abs(r.profit)));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn("min-w-0 truncate", row.name === NOT_KNOWN ? "text-subtle" : "font-medium text-ink")} title={row.name}>
              {row.name}
            </span>
            <span className={cn("ps-num shrink-0 font-semibold", row.profit < 0 ? "text-loss" : "text-ink")}>{money(row.profit)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className={cn("h-full rounded-full", row.profit < 0 ? "bg-loss" : "bg-profit")} style={{ width: `${Math.max(2, (Math.abs(row.profit) / maxProfit) * 100)}%` }} />
          </div>
          <p className="ps-num mt-1 text-xs text-subtle">
            {money(row.sales)} sales · {row.units} sold{row.margin !== null ? ` · ${row.margin}% margin` : ""}
            {row.missingCost > 0 ? ` · ${row.missingCost} need a cost` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
