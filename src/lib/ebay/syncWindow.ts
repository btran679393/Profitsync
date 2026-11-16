// Decides how much an order sync asks eBay for.
//
// A "full" sync downloads the past year of orders (creation date) and the
// eBay money records (fees, refunds, labels, ad fees) from that same year.
// A "quick" sync only asks for orders created or changed since the last
// sync, plus the last few months of money records, so a store with
// thousands of orders syncs in seconds. A "history" sync brings in one
// chosen past year, back to eBay's two-year limit (Settings → Syncing).
//
// Money records are added up per order (a label bought, then voided; ad
// fees charged after the sale…). Adding up only part of an order's records
// would save a wrong total, so money records are only applied to orders
// created inside the window that was downloaded (see financeCovers).

const DAY_MS = 24 * 60 * 60 * 1000;

// How far back a full sync looks for orders.
export const ORDER_HISTORY_DAYS = 365;
// A quick sync re-reads this much before the last sync, in case eBay was
// slow to show a change.
export const QUICK_OVERLAP_MS = DAY_MS;
// Money records a quick sync reads. Fees, labels and ad fees for an order
// all land well within this time after the sale.
export const QUICK_FINANCE_DAYS = 90;
// A quick sync is only used when the last sync was this recent, so every
// order created since then is inside the quick money window.
export const QUICK_MAX_GAP_DAYS = 60;
// A full sync still runs this often, to fill in anything a quick sync
// can't (older photos, eBay-side refund adjustments on old orders).
export const FULL_SYNC_EVERY_DAYS = 7;

// eBay's getOrders only returns orders up to two years old; one day of
// margin keeps the request inside that.
export const EBAY_MAX_HISTORY_DAYS = 729;
// Money records for an order (fees, labels, refunds) land within this long
// after the sale; a past-year import reads this far past the year's end.
export const HISTORY_FINANCE_TAIL_DAYS = 90;

// "history" = bringing in one chosen past year (Settings → Syncing).
export type SyncMode = "full" | "quick" | "history";

export type SyncWindow = {
  mode: SyncMode;
  // Why this mode was picked (for the logs).
  reason: "requested" | "first" | "stale" | "weekly" | "recent" | "year";
  // The eBay getOrders filter.
  orderFilter: string;
  // Money records are read from here to `until`.
  financeStart: Date;
  until: Date;
  // New orders older than this aren't added.
  ordersFrom: Date;
  // Orders created after this don't have all their money records in the
  // window, so their totals aren't saved (see financeCovers).
  financeOrdersUntil: Date;
};

function validDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function planSyncWindow({
  now,
  lastSyncAt,
  lastFullSyncAt,
  forceFull = false,
}: {
  now: Date;
  lastSyncAt?: unknown;
  lastFullSyncAt?: unknown;
  forceFull?: boolean;
}): SyncWindow {
  const until = new Date(now.getTime());
  const last = validDate(lastSyncAt);
  const lastFull = validDate(lastFullSyncAt);

  let reason: SyncWindow["reason"] | null = null;
  if (forceFull) reason = "requested";
  else if (!last || !lastFull || last.getTime() > now.getTime()) reason = "first";
  else if (now.getTime() - last.getTime() > QUICK_MAX_GAP_DAYS * DAY_MS) reason = "stale";
  else if (now.getTime() - lastFull.getTime() > FULL_SYNC_EVERY_DAYS * DAY_MS) reason = "weekly";

  if (reason) {
    const historyStart = new Date(now.getTime() - ORDER_HISTORY_DAYS * DAY_MS);
    return {
      mode: "full",
      reason,
      orderFilter: `creationdate:[${historyStart.toISOString()}..${until.toISOString()}]`,
      // A little extra so a sale right at the edge still has its fee record.
      financeStart: new Date(historyStart.getTime() - 2 * DAY_MS),
      until,
      ordersFrom: historyStart,
      financeOrdersUntil: until,
    };
  }

  const since = new Date((last as Date).getTime() - QUICK_OVERLAP_MS);
  return {
    mode: "quick",
    reason: "recent",
    orderFilter: `lastmodifieddate:[${since.toISOString()}..${until.toISOString()}]`,
    financeStart: new Date(now.getTime() - QUICK_FINANCE_DAYS * DAY_MS),
    until,
    ordersFrom: new Date(now.getTime() - ORDER_HISTORY_DAYS * DAY_MS),
    financeOrdersUntil: until,
  };
}

// The oldest moment eBay will still return orders from.
function ebayOldest(now: Date) {
  return new Date(now.getTime() - EBAY_MAX_HISTORY_DAYS * DAY_MS);
}

// Past years a seller can bring in, newest first. A year eBay only partly
// keeps comes with the date it starts from.
export function historyYears(now: Date): Array<{ year: number; from: Date | null }> {
  const oldest = ebayOldest(now);
  const years: Array<{ year: number; from: Date | null }> = [];
  for (let year = now.getUTCFullYear() - 1; year >= oldest.getUTCFullYear(); year--) {
    const start = Date.UTC(year, 0, 1);
    years.push({ year, from: start < oldest.getTime() ? oldest : null });
  }
  return years;
}

// The window for bringing in one past year: that year's orders (back to
// eBay's two-year limit) and their money records, which can land up to
// three months after the year ends. null = a year eBay no longer keeps.
export function yearWindow(year: number, now: Date): SyncWindow | null {
  if (!historyYears(now).some((option) => option.year === year)) return null;
  const start = new Date(Math.max(Date.UTC(year, 0, 1), ebayOldest(now).getTime()));
  const end = new Date(Math.min(Date.UTC(year + 1, 0, 1) - 1, now.getTime()));
  const until = new Date(Math.min(end.getTime() + HISTORY_FINANCE_TAIL_DAYS * DAY_MS, now.getTime()));
  return {
    mode: "history",
    reason: "year",
    orderFilter: `creationdate:[${start.toISOString()}..${end.toISOString()}]`,
    financeStart: new Date(start.getTime() - 2 * DAY_MS),
    until,
    ordersFrom: start,
    financeOrdersUntil: end,
  };
}

// The eBay Finances filter for one kind of money record in the window
// (same form as "Check against eBay" in src/lib/ebay/finances.ts).
export function financeFilter(transactionType: string, window: Pick<SyncWindow, "financeStart" | "until">): string {
  return `transactionType:{${transactionType}},transactionDate:[${window.financeStart.toISOString()}..${window.until.toISOString()}]`;
}

// True when all of an order's money records fall inside the downloaded
// window, so their totals are complete and safe to save: created on or
// after the window's start and, for a past-year import, within that year.
export function financeCovers(orderDate: unknown, financeStart: Date, financeOrdersUntil?: Date): boolean {
  const date = validDate(orderDate);
  if (date === null || date.getTime() < financeStart.getTime()) return false;
  return !financeOrdersUntil || date.getTime() <= financeOrdersUntil.getTime();
}

function toCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export type SavedOrderMoney = {
  ebayFees: unknown;
  imageUrl: string | null;
  salePrice: unknown;
  refundAmount: unknown;
  status: string | null;
};

// Whether saving this sync's fees, photo and refund would change the saved
// order. Mirrors the update in the sync route, so unchanged orders can be
// skipped without a database round trip.
export function orderNeedsUpdate(
  saved: SavedOrderMoney,
  incoming: {
    feeCents: number | undefined;
    imageUrl: string | null;
    refundCents: number | undefined;
    // eBay's buyer-facing refund total (replaces the saved amount) rather
    // than a seller-side record (only ever raises it).
    buyerRefundConfirmed: boolean;
  }
): boolean {
  if (incoming.feeCents !== undefined && toCents(saved.ebayFees) !== incoming.feeCents) return true;
  if (!saved.imageUrl && incoming.imageUrl) return true;
  if (incoming.refundCents !== undefined) {
    const sale = toCents(saved.salePrice) ?? 0;
    const savedRefund = toCents(saved.refundAmount);
    const basis = incoming.buyerRefundConfirmed
      ? incoming.refundCents
      : Math.max(savedRefund ?? 0, incoming.refundCents);
    const amount = Math.min(sale, basis);
    if (savedRefund !== amount) return true;
    // A cancelled order keeps its status.
    if (saved.status === "CANCELED") return false;
    const status = basis >= sale - 1 ? "REFUNDED" : incoming.refundCents > 0 ? "PARTIALLY_REFUNDED" : saved.status;
    if (status !== saved.status) return true;
  }
  return false;
}

// eBay charges not tied to an order are saved as one expense per month.
// Bringing in a past year must only touch that year's months (the months
// after it weren't downloaded): the first month it must leave alone, as
// "YYYY-MM". null = no upper limit (normal syncs run up to today).
export function chargeMonthsBefore(window: Pick<SyncWindow, "mode" | "financeOrdersUntil">): string | null {
  if (window.mode !== "history") return null;
  const end = window.financeOrdersUntil;
  const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}
