"use client";

import type { ReactNode } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, InfoTip, Skeleton, StatCard, cn, type Trend } from "@/components/ui";
import type { ListingRow } from "../ListingsSection";
import { Icon } from "./Icon";
import { ListingImage } from "./ListingImage";
import { formatOrderDate, getOrderProfit, isFullyRefunded, money, percentChange, type Order, type Totals } from "./model";
import TrendChart, { type TrendPoint } from "./TrendChart";

export type CostSlice = { label: string; amount: number; color: string };

export type Attention = {
  needsCost: number; // orders in this period without a product cost
  lowStock: number;
  stale: number;
  reconnect: string[]; // store names whose eBay sign-in expired
};

function trendOf(current: number, previous: number | undefined, label: string, goodWhenUp = true): Trend {
  const value = percentChange(current, previous ?? null);
  return value === null ? null : { value, label, goodWhenUp };
}

function AttentionRow({
  tone,
  title,
  detail,
  onClick,
  href,
}: {
  tone: "warn" | "loss" | "accent";
  title: string;
  detail: string;
  onClick?: () => void;
  href?: string;
}) {
  const dot = tone === "warn" ? "bg-warn" : tone === "loss" ? "bg-loss" : "bg-accent";
  const Tag = href ? "a" : "button";
  return (
    <li>
      <Tag
        {...(href ? { href } : { type: "button" as const, onClick })}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="block text-xs text-muted">{detail}</span>
        </span>
        <Icon name="chevron" size={16} className="shrink-0 text-subtle" />
      </Tag>
    </li>
  );
}

export default function DashboardView({
  loading,
  totals,
  previous,
  comparisonLabel,
  rangeLabel,
  trend,
  topListings,
  costs,
  attention,
  recentOrders,
  goal,
  hasOrders,
  onOpenOrder,
  onGoOrders,
  onGoListings,
  onSync,
}: {
  loading: boolean;
  totals: Totals;
  previous: Totals | null;
  comparisonLabel: string;
  rangeLabel: string;
  trend: TrendPoint[];
  topListings: ListingRow[];
  costs: CostSlice[];
  attention: Attention;
  recentOrders: Order[];
  goal: ReactNode;
  hasOrders: boolean;
  onOpenOrder: (id: number) => void;
  onGoOrders: (filter?: "all" | "pending" | "refunded") => void;
  onGoListings: () => void;
  onSync: () => void;
}) {
  const costTotal = costs.reduce((sum, slice) => sum + slice.amount, 0);
  const costsRecorded = totals.orderCount > 0 ? (totals.completedCount / totals.orderCount) * 100 : 0;
  const attentionCount =
    (attention.needsCost > 0 ? 1 : 0) + (attention.lowStock > 0 ? 1 : 0) + (attention.stale > 0 ? 1 : 0) + attention.reconnect.length;

  if (!loading && !hasOrders) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="chart" size={20} />}
          title="Your dashboard fills in after your first sync"
          description="Sync brings in your orders, eBay fees, shipping labels and refunds. It takes about a minute."
          action={
            <Button variant="primary" onClick={onSync} icon={<Icon name="refresh" size={16} />}>
              Sync orders
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6 xl:grid-cols-5">
        <StatCard
          className="col-span-2 lg:col-span-2 xl:col-span-1"
          label="Revenue"
          loading={loading}
          value={money(totals.totalRevenue)}
          trend={trendOf(totals.totalRevenue, previous?.totalRevenue, comparisonLabel)}
          note={`${totals.orderCount} order${totals.orderCount === 1 ? "" : "s"}`}
        />
        <StatCard
          className="col-span-2 lg:col-span-2 xl:col-span-1"
          label="Net profit"
          loading={loading}
          tone={totals.netProfit < 0 ? "loss" : "profit"}
          value={money(totals.netProfit)}
          trend={trendOf(totals.netProfit, previous?.netProfit, comparisonLabel)}
          note={totals.expensesTotal > 0 ? `after ${money(totals.expensesTotal)} expenses` : undefined}
        />
        <StatCard
          className="lg:col-span-2 xl:col-span-1"
          label="Margin"
          loading={loading}
          value={`${totals.profitMargin.toFixed(1)}%`}
          trend={
            previous && previous.completedCount > 0
              ? { value: totals.profitMargin - previous.profitMargin, unit: " pts", label: comparisonLabel }
              : null
          }
        />
        <StatCard
          className="lg:col-span-3 xl:col-span-1"
          label="Avg profit / order"
          loading={loading}
          value={money(totals.avgProfitPerOrder)}
          trend={trendOf(totals.avgProfitPerOrder, previous?.avgProfitPerOrder, comparisonLabel)}
        />
        <StatCard
          className="col-span-2 lg:col-span-3 xl:col-span-1"
          label={totals.totalLabels > 0 ? "eBay fees & shipping" : "eBay fees"}
          loading={loading}
          value={money(totals.totalFees + totals.totalLabels)}
          trend={trendOf(totals.totalFees + totals.totalLabels, previous ? previous.totalFees + previous.totalLabels : undefined, comparisonLabel, false)}
          note={totals.totalOtherFees > 0 ? `incl. ${money(totals.totalOtherFees)} ads & other` : undefined}
        />
      </div>

      {/* Chart + goal and to-dos */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card id="performance" className="xl:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-1.5">
                Revenue vs. net profit
                <InfoTip content="Running totals for the period. Net profit counts orders with a product cost, minus refund losses and expenses, the same as the Net profit card." />
              </span>
            }
            description={rangeLabel}
          />
          <div className="px-5 pb-5 pt-4">{loading ? <Skeleton className="h-60 w-full" /> : <TrendChart points={trend} />}</div>
        </Card>

        <div className="flex flex-col gap-5">
          {goal}

          <Card className="flex-1">
            <CardHeader
              title="Needs attention"
              description="Fix these for accurate profit"
              actions={attentionCount > 0 ? <Badge tone="warn">{attentionCount}</Badge> : <Badge tone="profit">All clear</Badge>}
            />
            <div className="px-3 pb-3 pt-2">
              {attentionCount === 0 ? (
                <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted">
                  <Icon name="check" size={16} className="text-profit" /> Every order in this period has a cost.
                </p>
              ) : (
                <ul>
                  {attention.reconnect.map((name) => (
                    <AttentionRow key={name} tone="loss" title={`Reconnect ${name}`} detail="eBay sign-in expired, so sync is paused" href="/api/ebay/auth" />
                  ))}
                  {attention.needsCost > 0 && (
                    <AttentionRow
                      tone="warn"
                      title={`${attention.needsCost} order${attention.needsCost === 1 ? " needs" : "s need"} a product cost`}
                      detail="Profit leaves these out until you add one"
                      onClick={() => onGoOrders("pending")}
                    />
                  )}
                  {attention.lowStock > 0 && (
                    <AttentionRow tone="accent" title={`${attention.lowStock} listing${attention.lowStock === 1 ? " is" : "s are"} running low`} detail="Selling, with only a few left" onClick={onGoListings} />
                  )}
                  {attention.stale > 0 && (
                    <AttentionRow tone="accent" title={`${attention.stale} listing${attention.stale === 1 ? " isn't" : "s aren't"} selling`} detail="No sale in a while" onClick={onGoListings} />
                  )}
                </ul>
              )}
              <div className="mt-2 border-t border-line px-2 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Costs recorded</span>
                  <span className="ps-num font-medium text-ink">
                    {totals.completedCount}/{totals.orderCount}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(costsRecorded)} aria-valuemin={0} aria-valuemax={100} aria-label="Orders with a product cost">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${costsRecorded}%` }} />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Top listings, where the money went, recent orders */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader
            title="Top listings"
            description={`Most profit · ${rangeLabel.toLowerCase()}`}
            actions={
              <Button variant="ghost" size="sm" onClick={onGoListings}>
                All listings
              </Button>
            }
          />
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : topListings.length === 0 ? (
            <EmptyState title="No profitable listings yet" description="Listings appear here once their orders have a cost." className="py-10" />
          ) : (
            <ol className="px-3 pb-3 pt-2">
              {topListings.map((row, index) => (
                <li key={row.key} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <span className="ps-num w-4 shrink-0 text-xs font-semibold text-subtle">{index + 1}</span>
                  <ListingImage imageUrl={row.imageUrl} item={row.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink" title={row.title}>{row.title}</span>
                    <span className="ps-num block text-xs text-muted">
                      {row.unitsSold} sold · {money(row.revenue)}
                    </span>
                  </span>
                  <span className={cn("ps-num shrink-0 text-sm font-semibold", row.netProfit < 0 ? "text-loss" : "text-profit")}>{money(row.netProfit)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <CardHeader title="Where the money went" description={`Costs · ${rangeLabel.toLowerCase()}`} />
          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-3 w-full" />
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : costTotal <= 0 ? (
            <EmptyState title="No costs in this period" className="py-10" />
          ) : (
            <div className="p-5">
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                {costs.filter((c) => c.amount > 0).map((slice) => (
                  <span key={slice.label} className="h-full" style={{ width: `${(slice.amount / costTotal) * 100}%`, background: slice.color }} />
                ))}
              </div>
              <ul className="mt-4 space-y-2.5">
                {costs.map((slice) => (
                  <li key={slice.label} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{slice.label}</span>
                    <span className="ps-num text-xs text-subtle">{costTotal > 0 ? `${((slice.amount / costTotal) * 100).toFixed(0)}%` : ""}</span>
                    <span className="ps-num w-24 text-right font-medium text-ink">{money(slice.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
                <span className="font-medium text-ink">Total costs</span>
                <span className="ps-num font-semibold text-ink">{money(costTotal)}</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            title="Recent orders"
            description="Your latest sales"
            actions={
              <Button variant="ghost" size="sm" onClick={() => onGoOrders("all")}>
                All orders
              </Button>
            }
          />
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <ul className="px-3 pb-3 pt-2">
              {recentOrders.map((order) => {
                const refunded = isFullyRefunded(order);
                const profit = getOrderProfit(order);
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => onOpenOrder(order.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <ListingImage imageUrl={order.imageUrl} item={order.item} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink" title={order.item}>{order.item}</span>
                        <span className="block text-xs text-muted">{formatOrderDate(order.orderDate)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="ps-num block text-sm font-medium text-ink">{money(order.salePrice)}</span>
                        {refunded ? (
                          <Badge tone="loss">Refunded</Badge>
                        ) : profit === null ? (
                          <Badge tone="warn">Needs cost</Badge>
                        ) : (
                          <span className={cn("ps-num block text-xs font-semibold", profit < 0 ? "text-loss" : "text-profit")}>
                            {profit < 0 ? "−" : "+"}
                            {money(Math.abs(profit))}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
