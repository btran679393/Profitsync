"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/components/ui";
import { buildInventory, type InventoryItem, type InventorySale, type Purchase } from "@/lib/inventory";
import type { FundsSummary, PayoutsResponse } from "@/lib/ebay/payouts";
import { getShippingCost, isCanceled, isFullyRefunded, localDateKey, type Order } from "./model";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

// Payout figures are kept for a few minutes so going back and forth to the
// dashboard doesn't ask eBay every time.
const FUNDS_CACHE_MS = 10 * 60 * 1000;
const fundsCacheKey = (storeKey: string) => `profitsync:funds:${storeKey}`;

type Funds = { funds: FundsSummary; nextUp: number };

function readCachedFunds(storeKey: string): Funds | null {
  try {
    const raw = window.sessionStorage.getItem(fundsCacheKey(storeKey));
    if (!raw) return null;
    const cached = JSON.parse(raw) as Funds & { at: number };
    return Date.now() - cached.at < FUNDS_CACHE_MS ? cached : null;
  } catch {
    return null;
  }
}

async function loadFunds(storeKey: string): Promise<Funds | null> {
  const cached = readCachedFunds(storeKey);
  if (cached) return cached;
  try {
    const response = await fetch("/api/ebay/payouts?days=30", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as PayoutsResponse;
    const nextUp = data.payouts.filter((p) => p.status === "INITIATED").reduce((sum, p) => sum + p.amount, 0);
    const result = { funds: data.funds, nextUp };
    try {
      window.sessionStorage.setItem(fundsCacheKey(storeKey), JSON.stringify({ ...result, at: Date.now() }));
    } catch {}
    return result;
  } catch {
    return null;
  }
}

function Tile({
  label,
  value,
  note,
  tone = "neutral",
  onClick,
  loading,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "profit" | "warn";
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-line-strong hover:bg-surface-2/60"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-0.5 truncate text-xs text-subtle">{note}</p>
      </div>
      <span
        className={cn(
          "ps-num shrink-0 text-lg font-semibold",
          loading ? "animate-pulse text-subtle" : tone === "profit" ? "text-profit" : tone === "warn" ? "text-warn" : "text-ink"
        )}
      >
        {loading ? "…" : value}
      </span>
    </button>
  );
}

// Two quick links on the Dashboard: money still at eBay (Payouts) and
// stock not sold yet (Inventory). On plans without them, they point to the
// plans instead.
export default function MoneyCards({
  storeKey,
  hasStore,
  payoutsAllowed,
  inventoryAllowed,
  orders,
  staleAfterDays,
  onGo,
}: {
  storeKey: string;
  hasStore: boolean;
  payoutsAllowed: boolean;
  inventoryAllowed: boolean;
  orders: Order[];
  staleAfterDays: number;
  onGo: (view: "payouts" | "inventory" | "billing") => void;
}) {
  const [funds, setFunds] = useState<{ key: string; value: Funds | null } | null>(null);
  const [stock, setStock] = useState<{ purchases: Purchase[]; items: InventoryItem[] } | null>(null);

  useEffect(() => {
    if (!payoutsAllowed || !hasStore) return;
    let active = true;
    void loadFunds(storeKey).then((value) => {
      if (active) setFunds({ key: storeKey, value });
    });
    return () => {
      active = false;
    };
  }, [payoutsAllowed, hasStore, storeKey]);

  useEffect(() => {
    if (!inventoryAllowed) return;
    let active = true;
    fetch("/api/inventory", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { purchases?: Purchase[]; items?: InventoryItem[] } | null) => {
        if (active) setStock({ purchases: body?.purchases ?? [], items: body?.items ?? [] });
      })
      .catch(() => {
        if (active) setStock({ purchases: [], items: [] });
      });
    return () => {
      active = false;
    };
  }, [inventoryAllowed, storeKey]);

  const totals = useMemo(() => {
    if (!stock) return null;
    const sales: InventorySale[] = orders
      .filter((order) => !isCanceled(order) && !isFullyRefunded(order))
      .map((order) => ({
        ebayItemId: order.ebayItemId,
        orderDate: order.orderDate,
        quantity: order.quantity,
        revenue: Math.max(0, order.salePrice - order.refundAmount),
        fees: order.ebayFees + order.otherFees,
        shipping: getShippingCost(order),
      }));
    return buildInventory(stock.purchases, stock.items, sales, localDateKey(new Date()), staleAfterDays).totals;
  }, [stock, orders, staleAfterDays]);

  if (!hasStore) return null;

  const fundsValue = funds?.key === storeKey ? funds.value : undefined;
  const waiting = fundsValue ? fundsValue.funds.available + fundsValue.funds.processing + fundsValue.funds.onHold : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {payoutsAllowed ? (
        <Tile
          label="Money waiting at eBay"
          loading={fundsValue === undefined}
          value={fundsValue ? money(waiting) : "—"}
          tone={fundsValue && fundsValue.funds.onHold > 0 ? "warn" : "profit"}
          note={
            !fundsValue
              ? "Open Payouts to see it"
              : fundsValue.funds.onHold > 0
                ? `${money(fundsValue.funds.onHold)} on hold · see Payouts`
                : fundsValue.nextUp > 0
                  ? `Plus ${money(fundsValue.nextUp)} on its way to your bank`
                  : `${money(fundsValue.funds.available)} ready for your next payout`
          }
          onClick={() => onGo("payouts")}
        />
      ) : (
        <Tile label="Money waiting at eBay" value="Pro" note="See payouts and money waiting with Pro" onClick={() => onGo("billing")} />
      )}
      {inventoryAllowed ? (
        <Tile
          label="Unsold stock"
          loading={!totals}
          value={totals ? money(totals.unsoldCost) : "—"}
          tone={totals && totals.agedUnits > 0 ? "warn" : "neutral"}
          note={
            !totals || totals.purchases === 0
              ? "Log what you buy on the Inventory page"
              : totals.agedUnits > 0
                ? `${totals.agedUnits} unit${totals.agedUnits === 1 ? "" : "s"} unsold for ${staleAfterDays}+ days`
                : `${totals.remaining} unit${totals.remaining === 1 ? "" : "s"} left at cost`
          }
          onClick={() => onGo("inventory")}
        />
      ) : (
        <Tile label="Unsold stock" value="Pro" note="Track purchases and unsold stock with Pro" onClick={() => onGo("billing")} />
      )}
    </div>
  );
}
