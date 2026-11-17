// "What to do this week": a few plain suggestions worked out from the
// seller's own numbers (no AI). Each one says what was found and what to do.

import { listingSignals, type TrafficFacts } from "@/lib/listingSignals";

export type InsightRow = TrafficFacts & {
  title: string;
  unitsSold: number;
  netProfit: number;
  costMissing: number;
  adFees: number;
  lowestOffer: number | null;
  alert: "low" | "stale" | null;
};

export type Insight = {
  key: "losing" | "adFees" | "viewsNoSales" | "watchers" | "sellingFast" | "stale";
  tone: "loss" | "warn" | "accent" | "profit";
  title: string;
  detail: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const short = (title: string) => (title.length > 48 ? `${title.slice(0, 46).trimEnd()}…` : title);

// Ad fees count as "eating" profit when they're at least this share of
// what the listing made before ads, and at least $5.
export const AD_SHARE = 0.25;
const AD_MINIMUM = 5;

export function buildInsights(rows: InsightRow[], { staleAfterDays }: { staleAfterDays: number }, limit = 4): Insight[] {
  const insights: Insight[] = [];

  const losing = rows
    .filter((r) => r.unitsSold > 0 && r.costMissing === 0 && r.netProfit < 0)
    .sort((a, b) => a.netProfit - b.netProfit);
  if (losing.length > 0) {
    const total = losing.reduce((sum, r) => sum + r.netProfit, 0);
    insights.push({
      key: "losing",
      tone: "loss",
      title: `${plural(losing.length, "listing lost", "listings lost")} money (${money(total)})`,
      detail: `${short(losing[0].title)} lost ${money(Math.abs(losing[0].netProfit))} after costs. Raise the price or check its costs.`,
    });
  }

  const adHeavy = rows
    .filter((r) => r.adFees >= AD_MINIMUM && r.adFees >= AD_SHARE * (r.netProfit + r.adFees))
    .sort((a, b) => b.adFees - a.adFees);
  if (adHeavy.length > 0) {
    const total = adHeavy.reduce((sum, r) => sum + r.adFees, 0);
    const top = adHeavy[0];
    const share = Math.round((top.adFees / Math.max(0.01, top.netProfit + top.adFees)) * 100);
    insights.push({
      key: "adFees",
      tone: "warn",
      title: `Ad fees took ${money(total)} on ${plural(adHeavy.length, "listing", "listings")}`,
      detail: `On ${short(top.title)} promoted-listing fees took ${Math.min(share, 100)}% of its profit. Try a lower ad rate, or turn promotion off.`,
    });
  }

  const withSignal = (signal: ReturnType<typeof listingSignals>[number]) => rows.filter((r) => listingSignals(r).includes(signal));

  const unseen = withSignal("viewsNoSales").sort((a, b) => (b.views30 ?? 0) - (a.views30 ?? 0));
  if (unseen.length > 0) {
    insights.push({
      key: "viewsNoSales",
      tone: "warn",
      title: `${plural(unseen.length, "listing gets", "listings get")} views but no sales`,
      detail: `${short(unseen[0].title)} had ${unseen[0].views30} views in 30 days and no sale. The price or photos may be holding it back.`,
    });
  }

  const watched = withSignal("watchers").sort((a, b) => (b.watchers ?? 0) - (a.watchers ?? 0));
  if (watched.length > 0) {
    const top = watched[0];
    insights.push({
      key: "watchers",
      tone: "accent",
      title: `Send offers on ${plural(watched.length, "watched listing", "watched listings")}`,
      detail:
        top.lowestOffer !== null
          ? `${short(top.title)} has ${top.watchers} watching. You can offer as low as ${money(top.lowestOffer)} and still make your target profit.`
          : `${short(top.title)} has ${top.watchers} watching. Send them an offer on eBay.`,
    });
  }

  const fast = withSignal("sellingFast");
  if (fast.length > 0) {
    insights.push({
      key: "sellingFast",
      tone: "profit",
      title: `Room to raise prices on ${plural(fast.length, "listing", "listings")}`,
      detail: `${short(fast[0].title)} turns a high share of its views into sales. Try a slightly higher price on the next one.`,
    });
  }

  const stale = rows.filter((r) => r.status === "ACTIVE" && r.alert === "stale");
  if (stale.length > 0) {
    insights.push({
      key: "stale",
      tone: "warn",
      title: `${plural(stale.length, "listing hasn’t", "listings haven’t")} sold in ${staleAfterDays}+ days`,
      detail: `Money sits in stock that isn’t moving. A price cut, better photos or an offer to watchers can free it up.`,
    });
  }

  return insights.slice(0, limit);
}
