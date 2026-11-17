import { describe, expect, it } from "vitest";
import { STANDARD_FEE_RATE, lowestOfferPrice, observedRate } from "@/lib/offers";
import { conversionText, listingSignals } from "@/lib/listingSignals";
import { parseTrafficReport, trafficDateRange } from "@/lib/ebay/traffic";
import { buildInsights } from "@/lib/insights";

describe("lowest offer price", () => {
  it("covers fees, ad fees, shipping, cost and the target profit", () => {
    // 20 cost + 5 shipping + 10 profit = 35, over (1 − 0.13 fees − 0.02 ads)
    const price = lowestOfferPrice({ itemCost: 20, shipping: 5, feeRate: 0.13, adRate: 0.02, targetProfit: 10 })!;
    expect(price).toBe(41.18);
    // Check it: price − fees − ads − shipping − cost ≈ target
    expect(price - price * 0.13 - price * 0.02 - 5 - 20).toBeGreaterThanOrEqual(10);
  });

  it("uses eBay's standard rate and per-order fee without past sales", () => {
    const price = lowestOfferPrice({ itemCost: 20, shipping: 5, feeRate: null, adRate: 0, targetProfit: 0 })!;
    expect(price).toBe(Math.ceil(((20 + 5 + 0.4) / (1 - STANDARD_FEE_RATE)) * 100) / 100);
  });

  it("needs an item cost, and gives up when fees take nearly everything", () => {
    expect(lowestOfferPrice({ itemCost: null, shipping: 5, feeRate: 0.13, adRate: 0, targetProfit: 0 })).toBeNull();
    expect(lowestOfferPrice({ itemCost: 10, shipping: 5, feeRate: 0.7, adRate: 0.2, targetProfit: 0 })).toBeNull();
  });

  it("works out rates from past sales", () => {
    expect(observedRate(13, 100)).toBe(0.13);
    expect(observedRate(0, 0)).toBeNull();
  });
});

describe("listing signals", () => {
  const row = { status: "ACTIVE" as const, watchers: 0, views30: 0, sales30: 0 };
  it("flags views without sales, watchers and fast sellers", () => {
    expect(listingSignals({ ...row, views30: 80 })).toEqual(["viewsNoSales"]);
    expect(listingSignals({ ...row, watchers: 3 })).toEqual(["watchers"]);
    expect(listingSignals({ ...row, views30: 30, sales30: 4 })).toEqual(["sellingFast"]);
  });
  it("stays quiet for ended listings or without traffic", () => {
    expect(listingSignals({ ...row, status: "ENDED", watchers: 9 })).toEqual([]);
    expect(listingSignals({ ...row, views30: null })).toEqual([]);
  });
  it("shows the share of views that bought", () => {
    expect(conversionText(200, 5)).toBe("2.5%");
    expect(conversionText(0, 1)).toBeNull();
  });
});

describe("eBay traffic report", () => {
  it("reads each listing's numbers in the header's order", () => {
    const map = parseTrafficReport({
      header: { metrics: [{ key: "LISTING_IMPRESSION_TOTAL" }, { key: "LISTING_VIEWS_TOTAL" }, { key: "TRANSACTION" }] },
      records: [
        { dimensionValues: [{ value: "123" }], metricValues: [{ value: 900 }, { value: 120 }, { value: 3 }] },
        { dimensionValues: [{ value: "456" }], metricValues: [{ value: "40" }, { value: null }, { value: 0 }] },
      ],
    });
    expect(map.get("123")).toEqual({ impressions: 900, views: 120, sales: 3 });
    expect(map.get("456")).toEqual({ impressions: 40, views: 0, sales: 0 });
  });
  it("asks for the last 30 full days", () => {
    // 30 days ending yesterday (Nov 15), counting both ends.
    expect(trafficDateRange(new Date("2026-11-16T20:00:00Z"))).toBe("20261017..20261115");
  });
});

describe("what to do this week", () => {
  const base = {
    status: "ACTIVE" as const, title: "Item", unitsSold: 1, netProfit: 20, costMissing: 0, adFees: 0,
    lowestOffer: null, alert: null, watchers: 0, views30: 10, sales30: 1,
  };

  it("points out money-losing listings first", () => {
    const list = buildInsights([{ ...base, title: "Loser", netProfit: -12 }, { ...base, watchers: 5 }], { staleAfterDays: 60 });
    expect(list[0].key).toBe("losing");
    expect(list[0].detail).toContain("Loser lost $12.00");
    expect(list.map((i) => i.key)).toContain("watchers");
  });

  it("flags ad fees that eat a big share of profit", () => {
    const [ads] = buildInsights([{ ...base, title: "Promoted", netProfit: 10, adFees: 8 }], { staleAfterDays: 60 });
    expect(ads.key).toBe("adFees");
    expect(ads.detail).toContain("44%");
  });

  it("offers the lowest price to watchers when it's known", () => {
    const [w] = buildInsights([{ ...base, watchers: 4, lowestOffer: 31.5 }], { staleAfterDays: 60 });
    expect(w.detail).toContain("$31.50");
  });

  it("shows at most four, and nothing when all is well", () => {
    expect(buildInsights([base], { staleAfterDays: 60 })).toEqual([]);
    const many = buildInsights(
      [
        { ...base, netProfit: -5 },
        { ...base, adFees: 30, netProfit: 5 },
        { ...base, views30: 300, sales30: 0 },
        { ...base, watchers: 3 },
        { ...base, views30: 20, sales30: 5 },
        { ...base, alert: "stale" as const },
      ],
      { staleAfterDays: 60 }
    );
    expect(many).toHaveLength(4);
  });
});
