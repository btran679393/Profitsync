// What a listing's traffic says, in plain words. Used on the Listings page
// and by the Dashboard's "What to do this week" card.

export type TrafficFacts = {
  status: "ACTIVE" | "ENDED" | "UNLINKED";
  watchers: number | null;
  views30: number | null;
  sales30: number | null;
};

// Thresholds: enough views that "no sales" means something; enough
// watchers to be worth an offer; a share of views that buy that's high.
export const VIEWS_WITHOUT_SALES = 50;
export const WATCHERS_FOR_OFFER = 2;
export const FAST_SELLING_RATE = 0.1;
export const FAST_SELLING_SALES = 3;

export type ListingSignal = "viewsNoSales" | "watchers" | "sellingFast";

export function listingSignals(row: TrafficFacts): ListingSignal[] {
  if (row.status !== "ACTIVE") return [];
  const signals: ListingSignal[] = [];
  const views = row.views30 ?? 0;
  const sales = row.sales30 ?? 0;
  if (row.views30 !== null && views >= VIEWS_WITHOUT_SALES && sales === 0) signals.push("viewsNoSales");
  if ((row.watchers ?? 0) >= WATCHERS_FOR_OFFER) signals.push("watchers");
  if (views > 0 && sales >= FAST_SELLING_SALES && sales / views >= FAST_SELLING_RATE) signals.push("sellingFast");
  return signals;
}

// Share of views that ended in a sale, e.g. "3.2%" (null without views).
export function conversionText(views: number | null, sales: number | null): string | null {
  if (!views || views <= 0 || sales === null) return null;
  const rate = (sales / views) * 100;
  return `${rate < 10 ? rate.toFixed(1) : Math.round(rate)}%`;
}
