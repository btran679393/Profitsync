// "Ask ProfitSync": the seller asks a question in plain words and gets a
// short answer worked out from their own numbers. This file is shared by
// the page and the server, so keep it free of secrets and server imports.
//
// The page builds a small summary of what it already shows (totals for the
// chosen period, the listings, the weekly suggestions) and sends it with the
// question. Nothing else goes out: no buyer names, emails, passwords, eBay
// sign-ins or payment details.

import type { Insight } from "@/lib/insights";

// Questions each account can ask per day (Los Angeles time).
export const ASSISTANT_DAILY_LIMIT = 30;
// Longest question we accept, in characters.
export const ASSISTANT_MAX_QUESTION = 500;
// Earlier questions and answers sent along so follow-ups make sense.
export const ASSISTANT_HISTORY_TURNS = 4;
// Largest summary we accept, in characters of JSON.
export const ASSISTANT_MAX_SUMMARY = 24_000;
// Listings included in the summary (most important first).
const MAX_LISTINGS = 40;

export const SUGGESTED_QUESTIONS = [
  "Which listings should I lower the price on?",
  "Why is my profit lower than last period?",
  "Where is most of my money going?",
  "What should I focus on this week?",
];

export type AssistantTurn = { role: "user" | "assistant"; text: string };

// What GET /api/assistant tells the page.
export type AssistantStatus = {
  // False when the assistant isn't switched on for this site.
  available: boolean;
  // False when the seller's plan doesn't include it.
  allowed: boolean;
  remaining: number;
  limit: number;
};

type TotalsLike = {
  totalRevenue: number;
  totalFees: number;
  totalOtherFees: number;
  totalLabels: number;
  totalProductCosts: number;
  refundLosses: number;
  expensesTotal: number;
  netProfit: number;
  profitMargin: number;
  orderCount: number;
  pendingOrders: number;
  refundedCount: number;
};

type ListingLike = {
  title: string;
  status: string;
  price: number | null;
  available: number | null;
  unitCost: number | null;
  unitsSold: number;
  revenue: number;
  netProfit: number;
  margin: number | null;
  costMissing: number;
  adFees: number;
  refundedCount: number;
  lastSold: string | null;
  alert: "low" | "stale" | null;
  watchers: number | null;
  views30: number | null;
  sales30: number | null;
  lowestOffer: number | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const orNull = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : cents(n));

function totalsSummary(t: TotalsLike) {
  return {
    sales: cents(t.totalRevenue),
    orders: t.orderCount,
    ebaySellingFees: cents(t.totalFees - t.totalOtherFees),
    adAndOtherEbayFees: cents(t.totalOtherFees),
    shipping: cents(t.totalLabels),
    productCosts: cents(t.totalProductCosts),
    refundLosses: cents(t.refundLosses),
    expenses: cents(t.expensesTotal),
    netProfit: cents(t.netProfit),
    profitMarginPercent: Math.round(t.profitMargin * 10) / 10,
    ordersWithoutCost: t.pendingOrders,
    refundedOrders: t.refundedCount,
  };
}

// Listings that matter most for a question: ones that sold, ones losing
// money, and active ones with traffic or watchers.
function listingWeight(row: ListingLike) {
  return Math.abs(row.netProfit) + row.revenue / 10 + (row.views30 ?? 0) / 20 + (row.watchers ?? 0) * 5 + (row.status === "ACTIVE" ? 1 : 0);
}

export function buildAssistantSummary({
  periodLabel,
  storeLabel,
  today,
  totals,
  previousTotals,
  expensesByCategory,
  listings,
  insights,
  targetProfit,
}: {
  periodLabel: string;
  storeLabel: string;
  today: string;
  totals: TotalsLike;
  previousTotals: TotalsLike | null;
  expensesByCategory: Array<{ category: string; amount: number }>;
  listings: ListingLike[];
  insights: Insight[];
  targetProfit: number;
}) {
  const chosen = [...listings].sort((a, b) => listingWeight(b) - listingWeight(a)).slice(0, MAX_LISTINGS);
  return {
    today,
    period: periodLabel,
    store: storeLabel,
    currency: "USD",
    totals: totalsSummary(totals),
    previousPeriod: previousTotals ? totalsSummary(previousTotals) : null,
    expensesByCategory: expensesByCategory.map((e) => ({ category: e.category.slice(0, 60), amount: cents(e.amount) })),
    targetProfitPerSale: targetProfit,
    listingsShown: chosen.length,
    listingsTotal: listings.length,
    listings: chosen.map((row) => ({
      title: row.title.slice(0, 90),
      status: row.status,
      price: orNull(row.price),
      inStock: row.available,
      costPerItem: orNull(row.unitCost),
      unitsSold: row.unitsSold,
      sales: cents(row.revenue),
      netProfit: cents(row.netProfit),
      marginPercent: row.margin === null ? null : Math.round(row.margin * 10) / 10,
      salesWithoutCost: row.costMissing,
      adFees: cents(row.adFees),
      refunds: row.refundedCount,
      lastSold: row.lastSold ? row.lastSold.slice(0, 10) : null,
      stockAlert: row.alert,
      watchers: row.watchers,
      views30Days: row.views30,
      sales30Days: row.sales30,
      lowestOfferForTarget: orNull(row.lowestOffer),
    })),
    suggestions: insights.map((i) => `${i.title}. ${i.detail}`),
  };
}

export type AssistantSummary = ReturnType<typeof buildAssistantSummary>;

// Clean up what the page sent before it goes anywhere.
export function cleanQuestion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= ASSISTANT_MAX_QUESTION ? text : null;
}

export function cleanHistory(value: unknown): AssistantTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: AssistantTurn[] = [];
  for (const item of value.slice(-ASSISTANT_HISTORY_TURNS * 2)) {
    if (!item || typeof item !== "object") continue;
    const { role, text } = item as Record<string, unknown>;
    if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
      turns.push({ role, text: text.slice(0, 2000) });
    }
  }
  // The conversation has to start with a question.
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

// Today's date in Los Angeles, for the daily limit.
export function usageDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
