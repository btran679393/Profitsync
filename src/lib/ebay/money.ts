// How ProfitSync turns eBay's money records into order totals. Kept apart
// from the sync route so every rule here has tests (money.test.ts):
// - sales tax eBay collects never counts as the seller's revenue,
// - payouts are never counted (sales come from orders, not deposits),
// - fees, labels and other charges are added up per order, credits taken off,
// - charges that aren't tied to an order (store subscription, insertion
//   fees, ad fees billed by the day) become monthly business expenses.

export type Money = {
  value?: string;
  currency?: string;
};

export type FinanceTransaction = {
  transactionId?: string;
  orderId?: string;
  transactionType?: string;
  transactionDate?: string;
  totalFeeAmount?: Money;
  amount?: Money;
  bookingEntry?: string;
  feeType?: string;
};

export type RefundInfo = {
  amountCents: number;
  refundedAt: string | null;
};

// What getBuyerRefundInfo needs from an eBay order.
export type OrderMoney = {
  pricingSummary?: {
    total?: Money;
    tax?: Money;
  };
  paymentSummary?: {
    refunds?: Array<{
      refundId?: string;
      refundDate?: string;
      refundAmount?: Money;
      refundStatus?: string;
    }>;
  };
};

// Cents from an eBay amount, or null when it's missing, not US dollars, or
// not a plain number with at most two decimals.
export function parseMoney(value?: Money): number | null {
  if (!value || value.currency !== "USD") {
    return null;
  }
  if (typeof value.value !== "string" || !/^-?\d+(\.\d{1,2})?$/.test(value.value)) {
    return null;
  }
  const cents = Math.round(Number(value.value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function getRefundStatus(
  saleCents: number,
  refundCents: number
): "REFUNDED" | "PARTIALLY_REFUNDED" | "COST_NEEDED" {
  if (refundCents <= 0) {
    return "COST_NEEDED";
  }
  if (refundCents >= saleCents - 1) {
    return "REFUNDED";
  }
  return "PARTIALLY_REFUNDED";
}

// What the seller sold the order for: the buyer's total minus the sales tax
// eBay collects and pays for them. null when eBay didn't give a usable total.
export function sellerSaleCents(order: OrderMoney): number | null {
  const buyerTotalCents = parseMoney(order.pricingSummary?.total);
  if (buyerTotalCents === null) return null;
  const taxCents = Math.max(0, parseMoney(order.pricingSummary?.tax) ?? 0);
  return Math.max(0, buyerTotalCents - taxCents);
}

// Prefer the buyer-facing Fulfillment refund details over the seller-side
// Finances REFUND transaction amount (which can exclude reversed fees).
// Normalize the buyer refund to the sale-price basis used by ProfitSync;
// marketplace-collected sales tax must not inflate seller revenue refunds.
export function getBuyerRefundInfo(order: OrderMoney): RefundInfo | undefined {
  const entries = order.paymentSummary?.refunds;
  if (!entries?.length) return undefined;

  let buyerRefundCents = 0;
  let refundedAt: string | null = null;
  const seen = new Set<string>();

  for (const entry of entries) {
    const status = entry.refundStatus?.toUpperCase();
    // Only completed refunds should change ProfitSync revenue.
    if (status !== "REFUNDED" && status !== "COMPLETED") continue;
    if (entry.refundId && seen.has(entry.refundId)) continue;
    if (entry.refundId) seen.add(entry.refundId);
    const cents = parseMoney(entry.refundAmount);
    if (cents === null || cents <= 0) continue;
    buyerRefundCents += cents;
    if (entry.refundDate) {
      const date = new Date(entry.refundDate);
      if (!Number.isNaN(date.getTime())) {
        const iso = date.toISOString();
        if (!refundedAt || iso > refundedAt) refundedAt = iso;
      }
    }
  }

  if (buyerRefundCents <= 0) return undefined;
  const buyerTotalCents = parseMoney(order.pricingSummary?.total);
  if (buyerTotalCents === null || buyerTotalCents <= 0) return undefined;
  const taxCents = Math.min(buyerTotalCents, Math.max(0, parseMoney(order.pricingSummary?.tax) ?? 0));
  const saleCents = buyerTotalCents - taxCents;
  // eBay's order total includes buyer-paid sales tax. A complete buyer refund
  // therefore equals the buyer total, not sale + tax a second time.
  const amountCents =
    buyerRefundCents >= buyerTotalCents - 1
      ? saleCents
      : Math.min(saleCents, Math.round((buyerRefundCents * saleCents) / buyerTotalCents));
  return amountCents > 0 ? { amountCents, refundedAt } : undefined;
}

// eBay fees per order from SALE records (an order can have several).
export function feesByOrder(sales: FinanceTransaction[]): Map<string, number> {
  const fees = new Map<string, number>();
  for (const transaction of sales) {
    if (!transaction.orderId) continue;
    const cents = parseMoney(transaction.totalFeeAmount);
    if (cents === null) continue;
    fees.set(transaction.orderId, (fees.get(transaction.orderId) ?? 0) + cents);
  }
  return fees;
}

// A charge counts against the seller; a CREDIT (a voided label, a refunded
// fee) gives money back. eBay may sign amounts either way, so the booking
// entry decides.
function signedCents(transaction: FinanceTransaction): number | null {
  const amount = parseMoney(transaction.amount);
  if (amount === null) return null;
  const cents = Math.abs(amount);
  return transaction.bookingEntry === "CREDIT" ? -cents : cents;
}

// Net spend per order (e.g. labels bought minus labels voided).
export function netChargesByOrder(transactions: FinanceTransaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transaction.orderId) continue;
    const cents = signedCents(transaction);
    if (cents === null) continue;
    totals.set(transaction.orderId, (totals.get(transaction.orderId) ?? 0) + cents);
  }
  return totals;
}

// ------------------------------------------------------------------
// eBay charges that aren't tied to an order
// ------------------------------------------------------------------

// Expense categories for them. "eBay Store subscription" matches the
// category sellers already pick by hand, so the Taxes page groups them.
export const EBAY_CHARGE_CATEGORIES = {
  subscription: "eBay Store subscription",
  insertion: "eBay insertion fees",
  ads: "eBay ad fees",
  other: "Other eBay fees",
} as const;

export type EbayChargeCategory = (typeof EBAY_CHARGE_CATEGORIES)[keyof typeof EBAY_CHARGE_CATEGORIES];

export function chargeCategory(feeType: string | undefined): EbayChargeCategory {
  const type = (feeType ?? "").toUpperCase();
  if (type.includes("SUBSCRIPTION")) return EBAY_CHARGE_CATEGORIES.subscription;
  if (type.includes("INSERTION")) return EBAY_CHARGE_CATEGORIES.insertion;
  if (/(^|_)AD_FEE|AD_FEES|PROMOT|ADVERTIS/.test(type)) return EBAY_CHARGE_CATEGORIES.ads;
  return EBAY_CHARGE_CATEGORIES.other;
}

export type MonthlyCharge = {
  // "2026-11:eBay insertion fees": one expense row per store, month and kind.
  key: string;
  month: string; // YYYY-MM
  category: EbayChargeCategory;
  cents: number; // net of credits; can be 0 or less when credits win
  count: number;
};

function monthOf(date: string | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 7);
}

// Adds up charges with no order by month (UTC) and kind. Only months that
// start on or after `windowStart` are returned: an earlier month was only
// partly downloaded, and saving part of it would replace a correct total
// with a smaller one.
// The first month (YYYY-MM, UTC) that a download starting at windowStart
// covers from its first day.
export function firstFullMonth(windowStart: Date): string {
  const start = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), 1));
  if (start.getTime() < windowStart.getTime()) start.setUTCMonth(start.getUTCMonth() + 1);
  return start.toISOString().slice(0, 7);
}

export function monthlyUnattachedCharges(
  transactions: FinanceTransaction[],
  windowStart: Date
): MonthlyCharge[] {
  const fromMonth = firstFullMonth(windowStart);
  const byKey = new Map<string, MonthlyCharge>();
  for (const transaction of transactions) {
    if (transaction.orderId) continue;
    const month = monthOf(transaction.transactionDate);
    if (!month || month < fromMonth) continue;
    const cents = signedCents(transaction);
    if (cents === null) continue;
    const category = chargeCategory(transaction.feeType);
    const key = `${month}:${category}`;
    const entry = byKey.get(key) ?? { key, month, category, cents: 0, count: 0 };
    entry.cents += cents;
    entry.count++;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// The note shown on an expense row ProfitSync keeps up to date from eBay.
export function chargeNote(count: number): string {
  return `Added from eBay automatically (${count} ${count === 1 ? "charge" : "charges"} not tied to an order)`;
}
