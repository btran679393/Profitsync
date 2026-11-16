import { describe, expect, it } from "vitest";
import {
  FULL_SYNC_EVERY_DAYS,
  QUICK_FINANCE_DAYS,
  QUICK_MAX_GAP_DAYS,
  EBAY_MAX_HISTORY_DAYS,
  HISTORY_FINANCE_TAIL_DAYS,
  financeCovers,
  financeFilter,
  orderNeedsUpdate,
  historyYears,
  planSyncWindow,
  yearWindow,
  chargeMonthsBefore,
} from "@/lib/ebay/syncWindow";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-11T12:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

describe("planSyncWindow", () => {
  it("does a full year on the first sync", () => {
    const w = planSyncWindow({ now });
    expect(w.mode).toBe("full");
    expect(w.reason).toBe("first");
    expect(w.orderFilter).toBe(`creationdate:[${ago(365)}..${now.toISOString()}]`);
    // Money records start a little before the oldest order.
    expect(w.financeStart.getTime()).toBeLessThan(new Date(ago(365)).getTime());
  });

  it("is quick after a recent sync, re-reading a day before it", () => {
    const w = planSyncWindow({ now, lastSyncAt: ago(0.25), lastFullSyncAt: ago(2) });
    expect(w.mode).toBe("quick");
    expect(w.orderFilter).toBe(`lastmodifieddate:[${ago(1.25)}..${now.toISOString()}]`);
    expect(w.financeStart.toISOString()).toBe(ago(QUICK_FINANCE_DAYS));
  });

  it("goes full when asked", () => {
    expect(planSyncWindow({ now, lastSyncAt: ago(0.1), lastFullSyncAt: ago(1), forceFull: true })).toMatchObject({
      mode: "full",
      reason: "requested",
    });
  });

  it("goes full when the last sync is too old for the quick money window", () => {
    expect(planSyncWindow({ now, lastSyncAt: ago(QUICK_MAX_GAP_DAYS + 1), lastFullSyncAt: ago(1) }).reason).toBe("stale");
    // Every order created since the last quick-eligible sync is inside the money window.
    expect(QUICK_MAX_GAP_DAYS + 1).toBeLessThan(QUICK_FINANCE_DAYS);
  });

  it("goes full once a week", () => {
    expect(planSyncWindow({ now, lastSyncAt: ago(0.1), lastFullSyncAt: ago(FULL_SYNC_EVERY_DAYS + 0.5) }).reason).toBe("weekly");
  });

  it("goes full when no full sync is on record or dates are odd", () => {
    expect(planSyncWindow({ now, lastSyncAt: ago(0.1), lastFullSyncAt: null }).mode).toBe("full");
    expect(planSyncWindow({ now, lastSyncAt: "not a date", lastFullSyncAt: ago(1) }).mode).toBe("full");
    // A clock in the future never shrinks the window.
    expect(planSyncWindow({ now, lastSyncAt: ago(-1), lastFullSyncAt: ago(1) }).mode).toBe("full");
  });
});

describe("financeFilter", () => {
  it("limits eBay money records to the window", () => {
    const w = planSyncWindow({ now, lastSyncAt: ago(0.1), lastFullSyncAt: ago(1) });
    expect(financeFilter("SALE", w)).toBe(`transactionType:{SALE},transactionDate:[${ago(QUICK_FINANCE_DAYS)}..${now.toISOString()}]`);
  });
});

describe("financeCovers", () => {
  const start = new Date(ago(90));
  it("only trusts totals for orders created inside the window", () => {
    expect(financeCovers(ago(10), start)).toBe(true);
    expect(financeCovers(ago(90), start)).toBe(true);
    expect(financeCovers(ago(91), start)).toBe(false);
    expect(financeCovers(null, start)).toBe(false);
    expect(financeCovers("garbage", start)).toBe(false);
  });
});

describe("orderNeedsUpdate", () => {
  const saved = { ebayFees: "13.25", imageUrl: "https://i.ebayimg.com/a.jpg", salePrice: "100.00", refundAmount: "0.00", status: "COMPLETED" };
  const none = { feeCents: undefined, imageUrl: null, refundCents: undefined, buyerRefundConfirmed: false };

  it("skips orders where nothing changed", () => {
    expect(orderNeedsUpdate(saved, none)).toBe(false);
    expect(orderNeedsUpdate(saved, { ...none, feeCents: 1325 })).toBe(false);
    expect(orderNeedsUpdate(saved, { ...none, imageUrl: "https://i.ebayimg.com/b.jpg" })).toBe(false);
  });

  it("updates changed fees and missing photos", () => {
    expect(orderNeedsUpdate(saved, { ...none, feeCents: 1400 })).toBe(true);
    expect(orderNeedsUpdate({ ...saved, imageUrl: null }, { ...none, imageUrl: "https://i.ebayimg.com/b.jpg" })).toBe(true);
  });

  it("updates new or changed refunds", () => {
    expect(orderNeedsUpdate(saved, { ...none, refundCents: 10000, buyerRefundConfirmed: true })).toBe(true);
    expect(orderNeedsUpdate(saved, { ...none, refundCents: 2500, buyerRefundConfirmed: true })).toBe(true);
  });

  it("skips a refund that's already saved", () => {
    const refunded = { ...saved, refundAmount: "100.00", status: "REFUNDED" };
    expect(orderNeedsUpdate(refunded, { ...none, refundCents: 10000, buyerRefundConfirmed: true })).toBe(false);
    const partial = { ...saved, refundAmount: "25.00", status: "PARTIALLY_REFUNDED" };
    expect(orderNeedsUpdate(partial, { ...none, refundCents: 2500, buyerRefundConfirmed: true })).toBe(false);
  });

  it("never lowers a refund from a seller-side record", () => {
    const partial = { ...saved, refundAmount: "40.00", status: "PARTIALLY_REFUNDED" };
    expect(orderNeedsUpdate(partial, { ...none, refundCents: 2500, buyerRefundConfirmed: false })).toBe(false);
    // eBay's buyer-facing total does replace it.
    expect(orderNeedsUpdate(partial, { ...none, refundCents: 2500, buyerRefundConfirmed: true })).toBe(true);
  });
});

describe("cancelled orders in sync", () => {
  it("keep their status when a refund comes in", () => {
    const canceled = { ebayFees: "13.25", imageUrl: "x", salePrice: "100.00", refundAmount: "100.00", status: "CANCELED" };
    expect(orderNeedsUpdate(canceled, { feeCents: undefined, imageUrl: null, refundCents: 10000, buyerRefundConfirmed: true })).toBe(false);
  });
});

describe("bringing in a past year", () => {
  it("offers the years eBay still keeps, newest first", () => {
    const years = historyYears(now);
    expect(years.map((y) => y.year)).toEqual([2025, 2024]);
    expect(years[0].from).toBeNull();
    // 2024 only from two years back (eBay's limit).
    expect(years[1].from?.toISOString()).toBe(ago(EBAY_MAX_HISTORY_DAYS));
  });

  it("asks eBay for that year and its money records up to three months later", () => {
    const w = yearWindow(2025, now)!;
    expect(w.mode).toBe("history");
    expect(w.orderFilter).toBe("creationdate:[2025-01-01T00:00:00.000Z..2025-12-31T23:59:59.999Z]");
    expect(w.ordersFrom.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(w.financeOrdersUntil.toISOString()).toBe("2025-12-31T23:59:59.999Z");
    expect(w.until.toISOString()).toBe(new Date(Date.UTC(2026, 0, 1) - 1 + HISTORY_FINANCE_TAIL_DAYS * DAY).toISOString());
  });

  it("never goes past eBay's two-year limit", () => {
    const w = yearWindow(2024, now)!;
    expect(w.orderFilter.startsWith(`creationdate:[${ago(EBAY_MAX_HISTORY_DAYS)}..`)).toBe(true);
    expect(yearWindow(2023, now)).toBeNull();
    expect(yearWindow(2026, now)).toBeNull();
  });

  it("only saves money totals for orders inside the chosen year", () => {
    const w = yearWindow(2025, now)!;
    expect(financeCovers("2025-06-01T00:00:00Z", w.financeStart, w.financeOrdersUntil)).toBe(true);
    // An early-2026 order only has part of its records in this window.
    expect(financeCovers("2026-02-01T00:00:00Z", w.financeStart, w.financeOrdersUntil)).toBe(false);
  });
});

describe("eBay charge months when bringing in a past year", () => {
  it("stops at the end of the chosen year", () => {
    expect(chargeMonthsBefore(yearWindow(2025, now)!)).toBe("2026-01");
  });
  it("has no limit on a normal sync", () => {
    expect(chargeMonthsBefore(planSyncWindow({ now }))).toBeNull();
  });
});
