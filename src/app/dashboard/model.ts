// Moved out of page.tsx unchanged (redesign phase 1).
import type { ListingRange, ListingRow } from "../ListingsSection";

// ============================================================
// TYPES
// ============================================================

export type ApiListing = {
  ebayItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  listingPrice: string | number;
  quantity: number;
  status: string;
  unitCost: string | number | null;
  shippingCost?: string | number | null;
  createdAt?: string | null;
};

export type Order = {
  id: number;
  // Which connected eBay store the order belongs to.
  ebayUserId: string | null;
  shippingLabelCost: number;
  // Other eBay charges tied to this order (e.g. promoted-listing ad fees).
  otherFees: number;
  // Shipping paid outside eBay, typed by the seller ("" = not set).
  shippingCost: string;
  savedShippingCost: string;
  // Store-wide "shipping per order" default (0 = not set).
  storeShipping: number;
  ebayOrderId: string | null;
  ebayBuyerId: string | null;
  ebayItemId: string | null;
  quantity: number;
  item: string;
  imageUrl: string | null;
  salePrice: number;
  ebayFees: number;
  productCost: string;
  savedProductCost: string;
  refundAmount: number;
  refundedAt: string | null;
  refundOutcome: string | null;
  refundShippingLoss: number;
  refundFeeLoss: number;
  status: string;
  orderDate: string | null;
};

export type ApiOrder = {
  id: number;
  ebayUserId?: string | null;
  ebayOrderId: string | null;
  ebayBuyerId: string | null;
  item: string;
  imageUrl?: string | null;
  salePrice: string | number;
  ebayFees: string | number;
  productCost: string | number | null;
  refundAmount?: string | number | null;
  refundedAt?: string | null;
  refundOutcome?: string | null;
  refundShippingLoss?: string | number | null;
  refundFeeLoss?: string | number | null;
  status: string;
  orderDate?: string | null;
  ebayItemId?: string | null;
  quantity?: number | null;
  shippingLabelCost?: string | number | null;
  otherFees?: string | number | null;
  shippingCost?: string | number | null;
};

export type SyncResponse = {
  success?: boolean;
  found?: number;
  imported?: number;
  skipped?: number;
  feesUpdated?: number;
  imagesImported?: number;
  imagesUpdated?: number;
  refundedImported?: number;
  refundsUpdated?: number;
  // Free plan: new orders left out because the month's allowance is used.
  ordersOverPlanLimit?: number;
  monthlyOrderLimit?: number | null;
  error?: string;
  message?: string;
};

export type OrderFilter = "all" | "completed" | "pending" | "refunded";

export type DateRange = "7d" | "30d" | "90d" | "all";


// ============================================================
// UTILITIES
// ============================================================

export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function isValidCost(value: string) {
  const trimmed = value.trim();

  return (
    trimmed !== "" &&
    /^\d+(\.\d{1,2})?$/.test(trimmed) &&
    Number.isFinite(Number(trimmed)) &&
    Number(trimmed) >= 0
  );
}

export function formatOrders(data: ApiOrder[], storeShipping = 0): Order[] {
  return data.map((order) => {
    const cost =
      order.productCost === null ||
      order.productCost === undefined
        ? ""
        : String(order.productCost);

    return {
      id: order.id,
      ebayOrderId: order.ebayOrderId,
      ebayUserId: order.ebayUserId ?? null,
      ebayBuyerId: order.ebayBuyerId ?? null,
      ebayItemId: order.ebayItemId ?? null,
      quantity: Math.max(1, Number(order.quantity) || 1),
      shippingLabelCost: Math.max(0, Number(order.shippingLabelCost ?? 0) || 0),
      otherFees: Math.max(0, Number(order.otherFees ?? 0) || 0),
      shippingCost: order.shippingCost === null || order.shippingCost === undefined ? "" : Number(order.shippingCost).toFixed(2),
      savedShippingCost: order.shippingCost === null || order.shippingCost === undefined ? "" : Number(order.shippingCost).toFixed(2),
      storeShipping,
      item: order.item,
      imageUrl: order.imageUrl ?? null,
      salePrice: Number(order.salePrice),
      ebayFees: Number(order.ebayFees),
      productCost: cost,
      savedProductCost: cost,
      refundAmount: Math.max(0, Number(order.refundAmount ?? 0) || 0),
      refundedAt: order.refundedAt ?? null,
      refundOutcome: order.refundOutcome ?? null,
      refundShippingLoss: Number(order.refundShippingLoss ?? 0),
      refundFeeLoss: Number(order.refundFeeLoss ?? 0),
      status: order.status,
      orderDate: order.orderDate ?? null,
    };
  });
}

export function isFullyRefunded(order: Order) {
  return order.status === "REFUNDED" ||
    order.status === "PARTIALLY_REFUNDED" ||
    order.refundAmount > 0;
}

export function getRefundLoss(order: Order) {
  if (!isFullyRefunded(order)) return 0;
  if (!order.refundOutcome) return 0; // Unreviewed refund: loss unknown.
  const productLoss = order.refundOutcome === "SHIPPED_LOST"
    ? Number(order.savedProductCost || 0) : 0;
  return productLoss + order.refundShippingLoss + order.refundFeeLoss;
}

// Kept for callers; partial refunds are treated like full refunds today.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isPartiallyRefunded(order: Order) {
  return false; // All confirmed refund states are excluded from active sales.
}

export function hasRecordedCost(order: Order) {
  return isValidCost(order.savedProductCost);
}

// Shipping counted against profit, first match wins (never added together):
// 1. what the seller typed for this order (or a listing default filled in),
// 2. a shipping label actually bought through eBay,
// 3. the store-wide "shipping per order" default.
export function getShippingCost(order: Order) {
  if (order.savedShippingCost !== "") return Number(order.savedShippingCost);
  if (order.shippingLabelCost > 0) return order.shippingLabelCost;
  return order.storeShipping;
}

export function getOrderProfit(order: Order) {
  // A fully refunded order is removed from profit reporting.
  // Its retained seller fees or other sunk costs may still need
  // separate accounting outside this dashboard.
  if (isFullyRefunded(order)) return null;
  if (!hasRecordedCost(order)) return null;
  return order.salePrice - order.refundAmount -
    order.ebayFees - order.otherFees - getShippingCost(order) - Number(order.savedProductCost);
}

// ============================================================
// VIEWS: Dashboard / Orders / Listings, kept in the URL hash
// so Back, refresh and shared links open the same view.
// ============================================================

export type View = "dashboard" | "orders" | "listings" | "expenses" | "taxes" | "billing" | "settings";

export function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function viewFromHash(hash: string): View {
  if (hash === "#orders") return "orders";
  if (hash === "#listings") return "listings";
  if (hash === "#expenses") return "expenses";
  if (hash === "#taxes") return "taxes";
  if (hash === "#billing") return "billing";
  if (hash === "#settings") return "settings";
  return "dashboard";
}

export const VIEW_COPY: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard Overview",
    subtitle: "Understand your sales, expenses, and profitability.",
  },
  orders: {
    title: "Orders",
    subtitle: "Review your orders and manage product costs.",
  },
  listings: {
    title: "Listings",
    subtitle: "See how every listing is selling and what it earns.",
  },
  expenses: {
    title: "Expenses",
    subtitle: "Packing supplies, subscriptions and other costs that aren't tied to one sale.",
  },
  taxes: {
    title: "Taxes",
    subtitle: "Your yearly profit and loss, ready for tax time.",
  },
  billing: {
    title: "Plan & billing",
    subtitle: "Choose the plan that fits your business.",
  },
  settings: {
    title: "Settings",
    subtitle: "Make ProfitSync work the way you like.",
  },
};

export function isOrderInListingRange(order: Order, range: ListingRange, now: Date) {
  if (range === "all") return true;
  if (range !== "year") return isOrderInDateRange(order, range, now);
  if (!order.orderDate) return false;
  const date = new Date(order.orderDate);
  return date.getFullYear() === now.getFullYear() && date <= now;
}

// ============================================================
// LISTINGS: group orders by the listing they came from
// ============================================================

export function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

// Stock alerts: "low" = sells (2+ units ever) but only 1–2 left; "stale" =
// active with no sale in 60+ days (or never, once known to ProfitSync for 60+ days).
// Defaults; sellers can change both in Settings → Listing alerts.


export function buildListingRows(
  orders: Order[],
  listings: ApiListing[],
  allOrders: Order[] = orders,
  now: Date = new Date(),
  alerts: { lowStockAt: number; staleAfterDays: number } = { lowStockAt: 2, staleAfterDays: 60 }
): ListingRow[] {
  const rows = new Map<string, ListingRow & { completedRevenue: number; completedProfit: number }>();
  const listingIdByTitle = new Map<string, string>();

  const blankRow = (key: string, title: string) => ({
    key, ebayItemId: null, title, imageUrl: null,
    status: "UNLINKED" as ListingRow["status"],
    price: null, available: null, unitCost: null, shippingDefault: null, unitsSold: 0, orderCount: 0,
    revenue: 0, fees: 0, shipping: 0, costs: 0, refundedCount: 0, refundLoss: 0,
    netProfit: 0, margin: null, costMissing: 0, shippingMissing: 0, lastSold: null, alert: null,
    completedRevenue: 0, completedProfit: 0,
  });

  for (const listing of listings) {
    const key = `item:${listing.ebayItemId}`;
    rows.set(key, {
      ...blankRow(key, listing.title),
      ebayItemId: listing.ebayItemId,
      imageUrl: listing.imageUrl,
      status: listing.status === "ACTIVE" ? "ACTIVE" : "ENDED",
      price: Number(listing.listingPrice),
      available: listing.status === "ACTIVE" ? listing.quantity : 0,
      unitCost: listing.unitCost === null || listing.unitCost === undefined ? null : Number(listing.unitCost),
      shippingDefault: listing.shippingCost === null || listing.shippingCost === undefined ? null : Number(listing.shippingCost),
    });
    listingIdByTitle.set(normalizeTitle(listing.title), listing.ebayItemId);
  }

  for (const order of orders) {
    // Prefer the saved listing ID; otherwise match on the exact title;
    // otherwise group past sales of the same item title together.
    const itemId = order.ebayItemId ?? listingIdByTitle.get(normalizeTitle(order.item)) ?? null;
    const key = itemId ? `item:${itemId}` : `title:${normalizeTitle(order.item)}`;
    let row = rows.get(key);
    if (!row) {
      row = { ...blankRow(key, order.item), ebayItemId: itemId };
      rows.set(key, row);
    }
    if (!row.imageUrl && order.imageUrl) row.imageUrl = order.imageUrl;
    if (order.orderDate && (!row.lastSold || order.orderDate > row.lastSold)) row.lastSold = order.orderDate;

    if (isFullyRefunded(order)) {
      row.refundedCount++;
      row.refundLoss += getRefundLoss(order);
      continue;
    }
    row.orderCount++;
    row.unitsSold += order.quantity;
    const revenue = Math.max(0, order.salePrice - order.refundAmount);
    row.revenue += revenue;
    row.fees += order.ebayFees + order.otherFees;
    row.shipping += getShippingCost(order);
    if (order.savedShippingCost === "") row.shippingMissing++;
    if (hasRecordedCost(order)) {
      row.costs += Number(order.savedProductCost);
      row.completedRevenue += revenue;
      row.completedProfit += getOrderProfit(order) ?? 0;
    } else {
      row.costMissing++;
    }
  }

  // All-time sales per listing (not just the chosen period) for stock alerts.
  const lifetime = new Map<string, { units: number; lastSold: string | null }>();
  for (const order of allOrders) {
    if (isFullyRefunded(order)) continue;
    const itemId = order.ebayItemId ?? listingIdByTitle.get(normalizeTitle(order.item));
    if (!itemId) continue;
    const entry = lifetime.get(itemId) ?? { units: 0, lastSold: null };
    entry.units += order.quantity;
    if (order.orderDate && (!entry.lastSold || order.orderDate > entry.lastSold)) entry.lastSold = order.orderDate;
    lifetime.set(itemId, entry);
  }
  const staleBefore = now.getTime() - alerts.staleAfterDays * 86400000;
  const firstSeen = new Map(listings.map((listing) => [listing.ebayItemId, listing.createdAt ?? null]));

  return [...rows.values()].map(({ completedRevenue, completedProfit, ...row }) => {
    const netProfit = completedProfit - row.refundLoss;
    let alert: ListingRow["alert"] = null;
    if (row.status === "ACTIVE" && row.ebayItemId) {
      const ever = lifetime.get(row.ebayItemId);
      const seen = firstSeen.get(row.ebayItemId);
      if (ever && ever.units >= 2 && (row.available ?? 0) <= alerts.lowStockAt) {
        alert = "low";
      } else if (
        ever?.lastSold
          ? new Date(ever.lastSold).getTime() < staleBefore
          : seen !== null && seen !== undefined && new Date(seen).getTime() < staleBefore
      ) {
        alert = "stale";
      }
    }
    return {
      ...row,
      netProfit,
      alert,
      margin: completedRevenue > 0 ? (netProfit / completedRevenue) * 100 : null,
    };
  });
}

export function getDateRangeStart(
  range: DateRange,
  now: Date
): Date | null {
  if (range === "all") return null;

  const days =
    range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return start;
}

export function isOrderInDateRange(
  order: Order,
  range: DateRange,
  now: Date
) {
  if (range === "all") return true;

  if (!order.orderDate) return false;

  const date = new Date(order.orderDate);

  if (Number.isNaN(date.getTime())) return false;

  const start = getDateRangeStart(range, now);

  if (!start) return true;

  return date >= start && date <= now;
}

export function dateRangeLabel(range: DateRange) {
  switch (range) {
    case "7d":
      return "Last 7 Days";
    case "30d":
      return "Last 30 Days";
    case "90d":
      return "Last 90 Days";
    default:
      return "All Time";
  }
}

export function formatOrderDate(value: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

// ============================================================
// PERIOD TOTALS (moved from page.tsx unchanged; also used for the
// "vs previous period" comparison on the dashboard)
// ============================================================

export function computeTotals(periodOrders: Order[], periodExpenses: Array<{ amount: string | number }>) {
  const activeOrders = periodOrders.filter((order) => !isFullyRefunded(order));
  const refundedCount = periodOrders.length - activeOrders.length;
  const totalRevenue = activeOrders.reduce(
    (sum, order) => sum + Math.max(0, order.salePrice - order.refundAmount), 0
  );
  const totalFees = activeOrders.reduce((sum, order) => sum + order.ebayFees + order.otherFees, 0);
  const totalLabels = activeOrders.reduce((sum, order) => sum + getShippingCost(order), 0);
  const totalOtherFees = activeOrders.reduce((sum, order) => sum + order.otherFees, 0);
  const completedOrders = activeOrders.filter(hasRecordedCost);
  const totalProductCosts = completedOrders.reduce(
    (sum, order) => sum + Number(order.savedProductCost), 0
  );
  const completedProfit = completedOrders.reduce(
    (sum, order) => sum + (getOrderProfit(order) ?? 0), 0
  );
  const refundLosses = periodOrders.reduce((sum, order) => sum + getRefundLoss(order), 0);
  const expensesTotal = periodExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const netProfit = completedProfit - refundLosses - expensesTotal;
  const completedRevenue = completedOrders.reduce(
    (sum, order) => sum + Math.max(0, order.salePrice - order.refundAmount), 0
  );
  const profitMargin = completedRevenue > 0
    ? (netProfit / completedRevenue) * 100 : 0;
  const pendingOrders = activeOrders.length - completedOrders.length;
  return {
    totalRevenue, totalFees, totalLabels, totalOtherFees, totalProductCosts, netProfit, expensesTotal, refundLosses, profitMargin,
    completedCount: completedOrders.length, pendingOrders,
    orderCount: activeOrders.length, refundedCount,
    // Display only: average profit of the orders that have a cost.
    completedProfit,
    avgProfitPerOrder: completedOrders.length > 0 ? completedProfit / completedOrders.length : 0,
  };
}

export type Totals = ReturnType<typeof computeTotals>;

// The window just before the chosen range, same length (null for "All time").
export function previousRange(range: DateRange, now: Date): { start: Date; end: Date } | null {
  const start = getDateRangeStart(range, now);
  if (!start) return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);
  return { start: previousStart, end: start };
}

// Percentage change for a stat card ("↑ 12.3%"), or null when there's
// nothing sensible to compare against.
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  if (Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
