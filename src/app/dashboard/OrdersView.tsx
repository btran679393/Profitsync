"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, EmptyState, Input, LoadingRegion, SegmentedControl, Select, Skeleton, cn } from "@/components/ui";
import { Icon } from "./Icon";
import { ListingImage } from "./ListingImage";
import { CostInput, OrderStatusBadge, ShippingInput } from "./OrderParts";
import {
  formatOrderDate,
  getOrderProfit,
  getRefundLoss,
  hasRecordedCost,
  isCanceled,
  isFullyRefunded,
  isPartiallyRefunded,
  isValidCost,
  getShippingCost,
  money,
  type Order,
  type OrderFilter,
} from "./model";

type SortKey = "newest" | "oldest" | "sale" | "profit";
const PAGE_SIZES = [25, 50, 100] as const;

// Profit for display: the draft cost while typing, the refund loss for a
// refund (same as the old table).
function displayProfit(order: Order): number | null {
  // A cancelled order has no profit or loss to show.
  if (isCanceled(order)) return null;
  if (isFullyRefunded(order)) return -getRefundLoss(order);
  if (!isValidCost(order.productCost)) return null;
  return order.salePrice - order.refundAmount - order.ebayFees - order.otherFees - getShippingCost(order) - Number(order.productCost);
}

export default function OrdersView({
  orders,
  periodOrders,
  allOrdersCount,
  loading,
  search,
  onSearch,
  filter,
  onFilter,
  savingId,
  recentlySavedId,
  inputsDisabled,
  shippingEnabled,
  onSaveShipping,
  onChangeCost,
  onSaveCost,
  onEnterCost,
  suggestedCost,
  onOpenOrder,
  onSync,
  tools,
}: {
  orders: Order[]; // already filtered by period, search and status
  periodOrders: Order[]; // every order in the period (for tab counts)
  allOrdersCount: number;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  filter: OrderFilter;
  onFilter: (value: OrderFilter) => void;
  savingId: number | null;
  recentlySavedId: number | null;
  inputsDisabled: boolean;
  shippingEnabled: boolean;
  onSaveShipping: (id: number, value: string) => Promise<void>;
  onChangeCost: (id: number, value: string) => void;
  onSaveCost: (id: number, value: string) => Promise<void> | void;
  onEnterCost: (input: HTMLInputElement) => void;
  suggestedCost: (order: Order) => number | null;
  onOpenOrder: (id: number) => void;
  onSync: () => void;
  // Store shipping default + import/export, shown in the toolbar.
  tools?: ReactNode;
}) {
  const [sort, setSort] = useState<SortKey>("newest");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  // Back to page 1 whenever what's shown changes.
  const signature = `${search}|${filter}|${sort}|${pageSize}|${orders.length}`;
  const [paging, setPaging] = useState({ signature, page: 1 });
  const page = paging.signature === signature ? paging.page : 1;
  const setPage = (next: number) => setPaging({ signature, page: next });

  const counts = useMemo(() => {
    let completed = 0;
    let pending = 0;
    let refunded = 0;
    for (const order of periodOrders) {
      if (isFullyRefunded(order)) refunded++;
      else if (hasRecordedCost(order)) completed++;
      else pending++;
    }
    return { all: periodOrders.length, completed, pending, refunded };
  }, [periodOrders]);

  const sorted = useMemo(() => {
    const list = [...orders];
    const time = (o: Order) => (o.orderDate ? new Date(o.orderDate).getTime() : 0);
    if (sort === "newest") list.sort((a, b) => time(b) - time(a) || b.id - a.id);
    if (sort === "oldest") list.sort((a, b) => time(a) - time(b) || a.id - b.id);
    if (sort === "sale") list.sort((a, b) => b.salePrice - a.salePrice);
    if (sort === "profit") list.sort((a, b) => (getOrderProfit(b) ?? -Infinity) - (getOrderProfit(a) ?? -Infinity));
    return list;
  }, [orders, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const from = sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(sorted.length, currentPage * pageSize);

  function sortHeader({ label, ascending, descending, align = "left" }: { label: string; ascending?: SortKey; descending: SortKey; align?: "left" | "right" }) {
    const active = sort === descending || sort === ascending;
    const direction = sort === ascending ? "ascending" : sort === descending ? "descending" : "none";
    return (
      <th scope="col" aria-sort={active ? direction : undefined} className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}>
        <button
          type="button"
          onClick={() => setSort(sort === descending && ascending ? ascending : descending)}
          className={cn("inline-flex items-center gap-1 rounded transition-colors hover:text-ink", active && "text-ink")}
        >
          {label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn(!active && "opacity-30", sort === ascending && "rotate-180")}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </th>
    );
  }

  const toolbar = (
    <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
      <SegmentedControl
        label="Order status"
        wrap
        value={filter}
        onChange={onFilter}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "pending", label: "Needs cost", count: counts.pending },
          { value: "completed", label: "Complete", count: counts.completed },
          { value: "refunded", label: "Refunded", count: counts.refunded },
        ]}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {tools}
        <div className="relative sm:w-60">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <Input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search orders" title="Search by item, eBay order number or buyer" aria-label="Search orders by item, order number or buyer" className="pl-9" />
        </div>
        <span className="sm:w-44 md:hidden">
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort orders">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="profit">Most profit</option>
            <option value="sale">Highest sale</option>
          </Select>
        </span>
      </div>
    </div>
  );

  if (!loading && allOrdersCount === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="orders" size={20} />}
          title="No orders yet"
          description="Sync to bring in your orders with their eBay fees, shipping labels and refunds."
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
    <Card className="overflow-hidden">
      {toolbar}

      {loading ? (
        <LoadingRegion label="Loading orders">
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="hidden h-8 w-28 md:block" />
              </div>
            ))}
          </div>
        </LoadingRegion>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Icon name="search" size={20} />}
          title="No orders match"
          description="Try another date range, status or search."
          action={
            search || filter !== "all" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onSearch("");
                  onFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop and tablet: table */}
          <div className="hidden max-h-[calc(100vh-15rem)] min-h-64 overflow-auto md:block">
            <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Orders, {from} to {to} of {sorted.length}</caption>
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-32" />
                <col className="w-36" />
                <col className="w-24" />
                <col className="hidden w-28 xl:table-column" />
                <col className="w-10" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-muted">
                <tr className="[&>th]:border-b [&>th]:border-line">
                  {sortHeader({ label: "Order", descending: "newest", ascending: "oldest" })}
                  {sortHeader({ label: "Sale", descending: "sale", align: "right" })}
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Fees · shipping</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Product cost</th>
                  {sortHeader({ label: "Profit", descending: "profit", align: "right" })}
                  <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">Status</th>
                  <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((order) => {
                  const refunded = isFullyRefunded(order);
                  const partialRefund = isPartiallyRefunded(order);
                  const profit = displayProfit(order);
                  const suggestion = !refunded && order.savedProductCost === "" ? suggestedCost(order) : null;
                  return (
                    <tr key={order.id} onClick={() => onOpenOrder(order.id)} className="group cursor-pointer transition-colors hover:bg-surface-2/60 [&>td]:border-b [&>td]:border-line">
                      <td className="px-3 py-3 pl-4">
                        <div className="flex items-center gap-3">
                          <ListingImage imageUrl={order.imageUrl} item={order.item} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenOrder(order.id);
                              }}
                              className="line-clamp-2 text-left font-medium leading-5 text-ink hover:text-accent-ink"
                              title={order.item}
                            >
                              {order.item}
                            </button>
                            <p className="mt-0.5 truncate text-xs text-subtle">
                              {formatOrderDate(order.orderDate)} · {order.ebayBuyerId || "Buyer unavailable"}
                            </p>
                            <span className="mt-1 inline-flex xl:hidden">
                              <OrderStatusBadge order={order} />
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="ps-num whitespace-nowrap px-3 py-3 text-right font-medium text-ink">
                        {refunded ? (
                          <span className="text-subtle line-through">{money(order.salePrice)}</span>
                        ) : (
                          <>
                            {money(Math.max(0, order.salePrice - order.refundAmount))}
                            {partialRefund && <p className="text-[11px] font-normal text-warn">Refund {money(order.refundAmount)}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <span className="ps-num block text-muted">{money(order.ebayFees)}</span>
                        {order.otherFees > 0 && (
                          <span className="ps-num block text-[11px] text-subtle" title="Other eBay charges for this order, e.g. promoted-listing ad fees">
                            + {money(order.otherFees)} other
                          </span>
                        )}
                        {!refunded && (
                          <div className="mt-1.5 flex justify-end">
                            <ShippingInput order={order} enabled={shippingEnabled} onSave={onSaveShipping} className="w-28" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {refunded ? (
                          <span className="text-xs text-subtle">Not needed</span>
                        ) : (
                          <CostInput
                            order={order}
                            saving={savingId === order.id}
                            saved={recentlySavedId === order.id}
                            disabled={savingId === order.id || inputsDisabled}
                            suggestion={suggestion}
                            onChange={onChangeCost}
                            onSave={onSaveCost}
                            onEnter={onEnterCost}
                          />
                        )}
                      </td>
                      <td className="ps-num whitespace-nowrap px-3 py-3 text-right font-semibold">
                        {isCanceled(order) ? (
                          <span className="font-normal text-subtle" aria-label="Not counted">—</span>
                        ) : profit === null ? (
                          <span className="font-normal text-subtle">Pending</span>
                        ) : (
                          <span className={profit < 0 ? "text-loss" : refunded && profit === 0 ? "text-subtle" : "text-profit"}>{money(profit === 0 ? 0 : profit)}</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-3 xl:table-cell">
                        <OrderStatusBadge order={order} />
                      </td>
                      <td className="px-3 py-3 pr-4 text-right">
                        <Icon name="chevron" size={16} className="text-subtle transition-transform group-hover:translate-x-0.5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phones: cards */}
          <ul className="divide-y divide-line md:hidden">
            {pageOrders.map((order) => {
              const refunded = isFullyRefunded(order);
              const profit = displayProfit(order);
              const suggestion = !refunded && order.savedProductCost === "" ? suggestedCost(order) : null;
              return (
                <li key={order.id} className="p-4">
                  <button type="button" onClick={() => onOpenOrder(order.id)} className="flex w-full items-start gap-3 text-left">
                    <ListingImage imageUrl={order.imageUrl} item={order.item} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium leading-5 text-ink">{order.item}</span>
                      <span className="mt-0.5 block text-xs text-subtle">{formatOrderDate(order.orderDate)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cn("ps-num block text-sm font-medium", refunded ? "text-subtle line-through" : "text-ink")}>{money(refunded ? order.salePrice : Math.max(0, order.salePrice - order.refundAmount))}</span>
                      {profit !== null && (
                        <span className={cn("ps-num block text-xs font-semibold", profit < 0 ? "text-loss" : "text-profit")}>
                          {profit < 0 ? "−" : "+"}
                          {money(Math.abs(profit))}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="mt-2 space-y-2 pl-[3.75rem]">
                    <OrderStatusBadge order={order} />
                    {!refunded && (
                      <div className="grid grid-cols-2 gap-2">
                        <label>
                          <span className="mb-1 block text-[11px] text-subtle">Product cost</span>
                          <CostInput
                            order={order}
                            saving={savingId === order.id}
                            saved={recentlySavedId === order.id}
                            disabled={savingId === order.id || inputsDisabled}
                            suggestion={suggestion}
                            onChange={onChangeCost}
                            onSave={onSaveCost}
                            onEnter={onEnterCost}
                          />
                        </label>
                        <label>
                          <span className="mb-1 block text-[11px] text-subtle">Shipping</span>
                          <ShippingInput order={order} enabled={shippingEnabled} onSave={onSaveShipping} />
                        </label>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Paging */}
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <span className="ps-num">
              {from}–{to} of {sorted.length} order{sorted.length === 1 ? "" : "s"}
              {sorted.length !== periodOrders.length && ` (${periodOrders.length} in this period)`}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                <span className="hidden sm:inline">Rows</span>
                <span className="w-20">
                  <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])} aria-label="Orders per page" className="h-8 text-xs">
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </Select>
                </span>
              </label>
              <Button size="sm" variant="secondary" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
                ←
              </Button>
              <span className="ps-num min-w-16 text-center">
                {currentPage} / {pageCount}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Next page">
                →
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
