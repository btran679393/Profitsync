import { describe, expect, it } from "vitest";
import { monthRange, reconcileMonth, type AppOrder, type EbaySale } from "@/lib/reconcile";
import { describeProgress } from "@/lib/ebay/readSync";

function app(orderId: string, saleCents: number, feeCents: number, extra: Partial<AppOrder> = {}): AppOrder {
  return { orderId, item: `Item ${orderId}`, saleCents, feeCents, refundCents: 0, inMonth: true, ...extra };
}

describe("reconcileMonth", () => {
  it("everything matches", () => {
    const sales = new Map<string, EbaySale>([
      ["A", { saleCents: 1000, feeCents: 130 }],
      ["B", { saleCents: 2500, feeCents: 300 }],
    ]);
    const result = reconcileMonth(sales, new Map(), new Set(sales.keys()), [app("A", 1000, 130), app("B", 2500, 300)]);
    expect(result.issues).toEqual([]);
    expect(result.matched).toBe(2);
    expect(result.ebay).toEqual({ orders: 2, salesCents: 3500, feesCents: 430, refundsCents: 0 });
    expect(result.profitsync).toEqual({ orders: 2, salesCents: 3500, feesCents: 430, refundsCents: 0 });
  });
  it("ignores a cent or two of rounding", () => {
    const sales = new Map([["A", { saleCents: 1000, feeCents: 130 }]]);
    expect(reconcileMonth(sales, new Map(), new Set(["A"]), [app("A", 1002, 128)]).issues).toEqual([]);
  });
  it("finds orders missing from ProfitSync", () => {
    const sales = new Map([["A", { saleCents: 1000, feeCents: 130 }]]);
    const result = reconcileMonth(sales, new Map(), new Set(["A"]), []);
    expect(result.issues.map((i) => i.kind)).toEqual(["missing_in_profitsync"]);
    expect(result.matched).toBe(0);
  });
  it("flags different fees and sale amounts", () => {
    const sales = new Map([["A", { saleCents: 1000, feeCents: 130 }]]);
    const kinds = reconcileMonth(sales, new Map(), new Set(["A"]), [app("A", 900, 160)]).issues.map((i) => i.kind);
    expect(kinds).toEqual(["sale_differs", "fees_differ"]);
  });
  it("an order eBay paid just after the month isn't called missing", () => {
    const result = reconcileMonth(new Map(), new Map(), new Set(["A"]), [app("A", 1000, 130)]);
    expect(result.issues).toEqual([]);
  });
  it("an order eBay has no payment for is flagged", () => {
    const result = reconcileMonth(new Map(), new Map(), new Set(), [app("A", 1000, 130)]);
    expect(result.issues.map((i) => i.kind)).toEqual(["missing_on_ebay"]);
  });
  it("finds refunds ProfitSync doesn't have", () => {
    const old = app("OLD", 2000, 200, { inMonth: false });
    const result = reconcileMonth(new Map(), new Map([["OLD", 2000]]), new Set(), [old]);
    expect(result.issues.map((i) => i.kind)).toEqual(["refund_missing"]);
    expect(result.ebay.refundsCents).toBe(2000);
    expect(result.profitsync.orders).toBe(0);
  });
  it("a recorded refund matches", () => {
    const old = app("OLD", 2000, 200, { inMonth: false, refundCents: 2000 });
    const result = reconcileMonth(new Map(), new Map([["OLD", 2000]]), new Set(), [old]);
    expect(result.issues).toEqual([]);
    expect(result.profitsync.refundsCents).toBe(2000);
  });
});

describe("monthRange", () => {
  it("covers the whole month in UTC", () => {
    expect(monthRange("2026-12")).toEqual({ from: new Date("2026-12-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") });
  });
  it("rejects bad months", () => {
    for (const bad of ["2026-13", "2026-00", "2026-1", "nope"]) expect(monthRange(bad)).toBeNull();
  });
});

describe("describeProgress", () => {
  it("reads like plain English", () => {
    expect(describeProgress({ stage: "orders", found: 0 })).toBe("Connecting to eBay…");
    expect(describeProgress({ stage: "orders", found: 1200 })).toBe("Bringing in your orders… 1,200 so far");
    expect(describeProgress({ stage: "saving", done: 50, total: 1200 })).toBe("Saving orders… 50 of 1,200");
  });
});
