// The Reports page: how the business is doing over time. Month by month
// (best and worst months), profit by category and by brand, and repeat
// buyers. Uses the same profit rules as the rest of ProfitSync.

import {
  computeTotals,
  getOrderProfit,
  getRefundLoss,
  isCanceled,
  isFullyRefunded,
  type ApiListing,
  type Order,
} from "@/app/dashboard/model";

const cents = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-11" for a date, in the seller's local time (like the rest of the app).
export function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthLabel(key: string, short = false) {
  const [y, m] = key.split("-").map(Number);
  const name = MONTH_NAMES[m - 1] ?? key;
  return short ? `${name.slice(0, 3)} ${String(y).slice(2)}` : `${name} ${y}`;
}

export type MonthRow = {
  key: string;
  sales: number;
  // Profit after costs, refund losses and that month's expenses.
  profit: number;
  orders: number;
  margin: number | null;
  // Orders with no product cost yet (left out of profit until added).
  missingCost: number;
};

// The last `count` months, oldest first, ending with this month.
export function monthlyReport(
  orders: Order[],
  expenses: Array<{ date: string; amount: string | number }>,
  count: number,
  now: Date
): MonthRow[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const byMonth = new Map(keys.map((k) => [k, { orders: [] as Order[], expenses: [] as Array<{ amount: string | number }> }]));
  for (const order of orders) {
    if (!order.orderDate) continue;
    byMonth.get(monthKey(new Date(order.orderDate)))?.orders.push(order);
  }
  for (const expense of expenses) byMonth.get(expense.date.slice(0, 7))?.expenses.push(expense);
  return keys.map((key) => {
    const bucket = byMonth.get(key)!;
    const t = computeTotals(bucket.orders, bucket.expenses);
    const active = bucket.orders.length > 0 || bucket.expenses.length > 0;
    return {
      key,
      sales: cents(t.totalRevenue),
      profit: cents(t.netProfit),
      orders: t.orderCount,
      margin: active && t.totalRevenue > 0 && t.completedCount > 0 ? Math.round(t.profitMargin * 10) / 10 : null,
      missingCost: t.pendingOrders,
    };
  });
}

// The chart starts at the first month with any sales or expenses, so
// months before the seller's history don't look like a blank chart.
// Keeps at least 3 months.
export function trimEmptyStart(months: MonthRow[]): MonthRow[] {
  const first = months.findIndex((m) => m.orders > 0 || m.profit !== 0);
  if (first <= 0) return months;
  return months.slice(Math.min(first, Math.max(0, months.length - 3)));
}

// Best and worst months among finished months that had sales (the last row
// is the month in progress, which would always look slow).
export function bestAndWorst(rows: MonthRow[]) {
  const finished = rows.slice(0, -1).filter((r) => r.orders > 0);
  const withSales = finished.length > 0 ? finished : rows.filter((r) => r.orders > 0);
  if (withSales.length === 0) return { best: null, worst: null, average: 0 };
  const best = withSales.reduce((a, b) => (b.profit > a.profit ? b : a));
  const worst = withSales.reduce((a, b) => (b.profit < a.profit ? b : a));
  const average = cents(withSales.reduce((sum, r) => sum + r.profit, 0) / withSales.length);
  return { best, worst: withSales.length > 1 ? worst : null, average };
}

// ------------------------------------------------------------
// Profit by category / brand
// ------------------------------------------------------------

export type GroupRow = {
  name: string;
  sales: number;
  profit: number;
  units: number;
  orders: number;
  margin: number | null;
  missingCost: number;
};

export const NOT_KNOWN = "Not known yet";
export const EVERYTHING_ELSE = "Everything else";

// What one order adds: kept sales, and profit when its cost is known (a
// full refund counts as what the refund cost you).
function orderFigures(order: Order) {
  if (isFullyRefunded(order)) return { sales: 0, profit: -getRefundLoss(order), known: true };
  const profit = getOrderProfit(order);
  return { sales: Math.max(0, order.salePrice - order.refundAmount), profit: profit ?? 0, known: profit !== null };
}

export function profitBy(orders: Order[], listings: ApiListing[], field: "categoryName" | "brand", top = 8): GroupRow[] {
  const lookup = new Map<string, string>();
  for (const listing of listings) {
    const value = listing[field]?.trim();
    if (value) lookup.set(listing.ebayItemId, value);
  }
  const groups = new Map<string, GroupRow & { knownSales: number }>();
  for (const order of orders) {
    if (isCanceled(order)) continue;
    const name = (order.ebayItemId && lookup.get(order.ebayItemId)) || NOT_KNOWN;
    const g = groups.get(name) ?? { name, sales: 0, profit: 0, units: 0, orders: 0, margin: null, missingCost: 0, knownSales: 0 };
    const f = orderFigures(order);
    g.sales += f.sales;
    g.orders += 1;
    if (!isFullyRefunded(order)) g.units += order.quantity || 1;
    if (f.known) {
      g.profit += f.profit;
      g.knownSales += f.sales;
    } else g.missingCost += 1;
    groups.set(name, g);
  }
  const all = [...groups.values()].sort((a, b) => b.profit - a.profit || b.sales - a.sales);
  const named = all.filter((g) => g.name !== NOT_KNOWN);
  const unknown = all.find((g) => g.name === NOT_KNOWN);
  const shown = named.slice(0, top);
  const rest = named.slice(top);
  if (rest.length > 0) {
    shown.push(
      rest.reduce(
        (acc, g) => ({
          ...acc,
          sales: acc.sales + g.sales,
          profit: acc.profit + g.profit,
          units: acc.units + g.units,
          orders: acc.orders + g.orders,
          missingCost: acc.missingCost + g.missingCost,
          knownSales: acc.knownSales + g.knownSales,
        }),
        { name: `${EVERYTHING_ELSE} (${rest.length})`, sales: 0, profit: 0, units: 0, orders: 0, margin: null, missingCost: 0, knownSales: 0 }
      )
    );
  }
  if (unknown) shown.push(unknown);
  return shown.map(({ knownSales, ...g }) => ({
    ...g,
    sales: cents(g.sales),
    profit: cents(g.profit),
    margin: knownSales > 0 ? Math.round((g.profit / knownSales) * 1000) / 10 : null,
  }));
}

// ------------------------------------------------------------
// Repeat buyers
// ------------------------------------------------------------

export type BuyerRow = { buyer: string; orders: number; spent: number; profit: number; lastOrder: string | null };

export type RepeatBuyers = {
  buyers: number;
  repeatBuyers: number;
  // Share of kept sales that came from buyers who ordered more than once.
  repeatSalesShare: number | null;
  top: BuyerRow[];
};

export function repeatBuyers(orders: Order[], top = 10): RepeatBuyers {
  const map = new Map<string, BuyerRow>();
  let totalSales = 0;
  for (const order of orders) {
    if (isCanceled(order) || !order.ebayBuyerId) continue;
    const f = orderFigures(order);
    totalSales += f.sales;
    const row = map.get(order.ebayBuyerId) ?? { buyer: order.ebayBuyerId, orders: 0, spent: 0, profit: 0, lastOrder: null };
    row.orders += 1;
    row.spent += f.sales;
    row.profit += f.known ? f.profit : 0;
    if (order.orderDate && (!row.lastOrder || order.orderDate > row.lastOrder)) row.lastOrder = order.orderDate;
    map.set(order.ebayBuyerId, row);
  }
  const repeat = [...map.values()].filter((b) => b.orders > 1);
  const repeatSales = repeat.reduce((sum, b) => sum + b.spent, 0);
  return {
    buyers: map.size,
    repeatBuyers: repeat.length,
    repeatSalesShare: totalSales > 0 ? Math.round((repeatSales / totalSales) * 1000) / 10 : null,
    top: repeat
      .sort((a, b) => b.orders - a.orders || b.spent - a.spent)
      .slice(0, top)
      .map((b) => ({ ...b, spent: cents(b.spent), profit: cents(b.profit) })),
  };
}
