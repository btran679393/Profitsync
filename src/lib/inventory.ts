// Purchases and inventory: what a seller bought (a sourcing trip, a lot, a
// single item), what's still on the shelf, how long things take to sell and
// whether each purchase has paid for itself.
//
// Sales come from eBay orders. An item is linked to the eBay listing it's
// sold through; each listing's sales are handed out to its linked items
// oldest purchase first (first in, first out), and only to purchases made
// on or before the sale date. Shared by the Inventory page, the API and the
// demo, and tested in inventory.test.ts.

export type Purchase = {
  id: number;
  // Which eBay store it's for; null = the whole business.
  ebayUserId: string | null;
  purchasedOn: string; // YYYY-MM-DD
  // Where it came from: "Goodwill on 5th", "Estate sale", "Facebook lot"…
  source: string;
  note: string | null;
};

export type InventoryItem = {
  id: number;
  purchaseId: number;
  name: string;
  quantity: number;
  // What one unit cost (a share of the purchase price).
  unitCost: string | number;
  // The eBay listing it's sold through, once listed.
  ebayItemId: string | null;
};

// One eBay sale, already worked out by the dashboard: only orders that
// weren't cancelled or fully refunded, with a partial refund taken off.
export type InventorySale = {
  ebayItemId: string | null;
  orderDate: string | null;
  quantity: number;
  revenue: number;
  fees: number; // eBay fees plus other eBay charges on the order
  shipping: number;
};

export type ItemStatus = "not-listed" | "listed" | "sold-out";

export type ItemStats = {
  item: InventoryItem;
  purchase: Purchase;
  unitCost: number;
  quantity: number;
  sold: number;
  remaining: number;
  status: ItemStatus;
  revenue: number;
  fees: number;
  shipping: number;
  // Cost of the units sold, at this item's unit cost.
  cogs: number;
  // revenue − fees − shipping − cogs, for the units sold so far.
  profit: number;
  // Average days from purchase to sale, per unit sold. null until one sells.
  avgDaysToSell: number | null;
  lastSoldOn: string | null;
  // Days since it was bought (how long unsold units have been waiting).
  daysHeld: number;
};

export type PurchaseStats = {
  purchase: Purchase;
  items: ItemStats[];
  spent: number;
  units: number;
  sold: number;
  remaining: number;
  // Share of units bought that have sold (0–1). null with no units.
  sellThrough: number | null;
  revenue: number;
  // What sales brought in after eBay fees and shipping.
  netProceeds: number;
  // netProceeds − spent: below zero until the purchase has paid for itself.
  paidBack: number;
  paidOff: boolean;
  // Profit on what's sold so far (sales after fees, shipping and those
  // units' cost). Unsold stock isn't counted against it.
  profitOnSold: number;
  // What the unsold units cost.
  unsoldCost: number;
  avgDaysToSell: number | null;
  daysSincePurchase: number;
};

export type InventoryTotals = {
  purchases: number;
  spent: number;
  units: number;
  sold: number;
  remaining: number;
  unsoldCost: number;
  notListedUnits: number;
  // Unsold units held longer than the "not selling" threshold.
  agedUnits: number;
  agedCost: number;
  sellThrough: number | null;
  avgDaysToSell: number | null;
  profitOnSold: number;
};

export type InventoryReport = {
  items: ItemStats[];
  purchases: PurchaseStats[];
  totals: InventoryTotals;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const cents = (value: number) => Math.round(value * 100) / 100;

// Whole days between two dates (YYYY-MM-DD or ISO), counted on calendar days.
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(to.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

// ------------------------------------------------------------------
// Splitting one price across what was bought
// ------------------------------------------------------------------

export type SplitLine = {
  quantity: number;
  // What the seller expects it to sell for (per unit). Optional.
  estimate?: number | null;
};

// Shares a purchase price across its lines. When every line has an
// estimate, each line's share follows its expected sales (a $200 camera in
// a $50 lot carries more of the cost than a $5 lens cap); otherwise every
// unit costs the same. Line totals add up exactly to the price; the unit
// cost is the line total over its quantity, to the cent.
export function splitPurchaseCost(totalCents: number, lines: SplitLine[]): { lineCents: number; unitCost: number }[] {
  const quantities = lines.map((line) => Math.max(1, Math.floor(line.quantity) || 1));
  const byEstimate = lines.length > 0 && lines.every((line) => typeof line.estimate === "number" && line.estimate > 0);
  const weights = lines.map((line, i) => (byEstimate ? (line.estimate as number) * quantities[i] : quantities[i]));
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  if (lines.length === 0 || weightTotal <= 0) return [];

  const total = Math.max(0, Math.round(totalCents));
  const exact = weights.map((w) => (total * w) / weightTotal);
  const lineCents = exact.map(Math.floor);
  // Hand the leftover cents to the lines with the largest remainders.
  let left = total - lineCents.reduce((sum, c) => sum + c, 0);
  const order = exact.map((value, i) => ({ i, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) lineCents[order[k].i]++;

  return lineCents.map((c, i) => ({ lineCents: c, unitCost: cents(c / 100 / quantities[i]) }));
}

// ------------------------------------------------------------------
// The report
// ------------------------------------------------------------------

type Working = ItemStats & { daysTotal: number };

export function buildInventory(
  purchases: Purchase[],
  items: InventoryItem[],
  sales: InventorySale[],
  today: string,
  staleAfterDays = 60
): InventoryReport {
  const purchaseById = new Map(purchases.map((p) => [p.id, p]));

  const working: Working[] = [];
  for (const item of items) {
    const purchase = purchaseById.get(item.purchaseId);
    if (!purchase) continue;
    const quantity = Math.max(0, Math.floor(item.quantity) || 0);
    working.push({
      item,
      purchase,
      unitCost: Number(item.unitCost) || 0,
      quantity,
      sold: 0,
      remaining: quantity,
      status: item.ebayItemId ? "listed" : "not-listed",
      revenue: 0,
      fees: 0,
      shipping: 0,
      cogs: 0,
      profit: 0,
      avgDaysToSell: null,
      lastSoldOn: null,
      daysHeld: daysBetween(purchase.purchasedOn, today),
      daysTotal: 0,
    });
  }

  // Each listing's items, oldest purchase first.
  const byListing = new Map<string, Working[]>();
  for (const stats of working) {
    const id = stats.item.ebayItemId;
    if (!id) continue;
    const list = byListing.get(id) ?? [];
    list.push(stats);
    byListing.set(id, list);
  }
  for (const list of byListing.values()) {
    list.sort((a, b) => a.purchase.purchasedOn.localeCompare(b.purchase.purchasedOn) || a.item.id - b.item.id);
  }

  const orderedSales = sales
    .filter((sale) => sale.ebayItemId && sale.orderDate && byListing.has(sale.ebayItemId))
    .sort((a, b) => (a.orderDate as string).localeCompare(b.orderDate as string));

  for (const sale of orderedSales) {
    const list = byListing.get(sale.ebayItemId as string) as Working[];
    const saleDay = (sale.orderDate as string).slice(0, 10);
    const units = Math.max(1, Math.floor(sale.quantity) || 1);
    let left = units;
    for (const stats of list) {
      if (left <= 0) break;
      // Only stock that had been bought by the day of the sale.
      if (stats.remaining <= 0 || stats.purchase.purchasedOn > saleDay) continue;
      const take = Math.min(left, stats.remaining);
      const share = take / units;
      stats.sold += take;
      stats.remaining -= take;
      stats.revenue += sale.revenue * share;
      stats.fees += sale.fees * share;
      stats.shipping += sale.shipping * share;
      stats.daysTotal += daysBetween(stats.purchase.purchasedOn, saleDay) * take;
      if (!stats.lastSoldOn || saleDay > stats.lastSoldOn) stats.lastSoldOn = saleDay;
      left -= take;
    }
    // Units nobody had in stock (sold before the purchase was tracked) are
    // left out.
  }

  const itemStats: ItemStats[] = working.map(({ daysTotal, ...stats }) => {
    const cogs = cents(stats.unitCost * stats.sold);
    return {
      ...stats,
      status: stats.quantity > 0 && stats.remaining === 0 ? "sold-out" : stats.status,
      revenue: cents(stats.revenue),
      fees: cents(stats.fees),
      shipping: cents(stats.shipping),
      cogs,
      profit: cents(stats.revenue - stats.fees - stats.shipping - cogs),
      avgDaysToSell: stats.sold > 0 ? Math.round((daysTotal / stats.sold) * 10) / 10 : null,
    };
  });

  const daysWeighted = (list: ItemStats[]) => {
    const sold = list.reduce((sum, s) => sum + s.sold, 0);
    if (sold === 0) return null;
    const days = list.reduce((sum, s) => sum + (s.avgDaysToSell ?? 0) * s.sold, 0);
    return Math.round((days / sold) * 10) / 10;
  };

  const purchaseStats: PurchaseStats[] = purchases
    .map((purchase) => {
      const list = itemStats.filter((s) => s.purchase.id === purchase.id);
      const spent = cents(list.reduce((sum, s) => sum + s.unitCost * s.quantity, 0));
      const units = list.reduce((sum, s) => sum + s.quantity, 0);
      const sold = list.reduce((sum, s) => sum + s.sold, 0);
      const revenue = cents(list.reduce((sum, s) => sum + s.revenue, 0));
      const netProceeds = cents(list.reduce((sum, s) => sum + s.revenue - s.fees - s.shipping, 0));
      const paidBack = cents(netProceeds - spent);
      return {
        purchase,
        items: list,
        spent,
        units,
        sold,
        remaining: units - sold,
        sellThrough: units > 0 ? sold / units : null,
        revenue,
        netProceeds,
        paidBack,
        paidOff: spent > 0 ? paidBack >= 0 : sold > 0,
        profitOnSold: cents(list.reduce((sum, s) => sum + s.profit, 0)),
        unsoldCost: cents(list.reduce((sum, s) => sum + s.unitCost * s.remaining, 0)),
        avgDaysToSell: daysWeighted(list),
        daysSincePurchase: daysBetween(purchase.purchasedOn, today),
      };
    })
    .sort((a, b) => b.purchase.purchasedOn.localeCompare(a.purchase.purchasedOn) || b.purchase.id - a.purchase.id);

  const units = itemStats.reduce((sum, s) => sum + s.quantity, 0);
  const sold = itemStats.reduce((sum, s) => sum + s.sold, 0);
  const aged = itemStats.filter((s) => s.remaining > 0 && s.daysHeld >= staleAfterDays);

  return {
    items: itemStats,
    purchases: purchaseStats,
    totals: {
      purchases: purchases.length,
      spent: cents(purchaseStats.reduce((sum, p) => sum + p.spent, 0)),
      units,
      sold,
      remaining: units - sold,
      unsoldCost: cents(itemStats.reduce((sum, s) => sum + s.unitCost * s.remaining, 0)),
      notListedUnits: itemStats.filter((s) => s.status === "not-listed").reduce((sum, s) => sum + s.remaining, 0),
      agedUnits: aged.reduce((sum, s) => sum + s.remaining, 0),
      agedCost: cents(aged.reduce((sum, s) => sum + s.unitCost * s.remaining, 0)),
      sellThrough: units > 0 ? sold / units : null,
      avgDaysToSell: daysWeighted(itemStats),
      profitOnSold: cents(itemStats.reduce((sum, s) => sum + s.profit, 0)),
    },
  };
}

// ------------------------------------------------------------------
// Checking what the seller typed (shared by the API and the form)
// ------------------------------------------------------------------

export const MAX_SOURCE_LENGTH = 60;
export const MAX_ITEM_NAME_LENGTH = 120;
export const MAX_ITEMS_PER_PURCHASE = 100;
export const MAX_QUANTITY = 10_000;

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : null;
}

// Dollars like "12" or "12.50" as cents, or null.
export function parseDollars(value: unknown, max = 1_000_000): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return amount >= 0 && amount <= max ? Math.round(amount * 100) : null;
}

export function parseQuantity(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY ? n : null;
}
