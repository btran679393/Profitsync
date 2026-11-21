import { describe, expect, it } from "vitest";
import { allowedNewOrderIds, lockedStoreIds, planForRow, trialEligible, type SubscriptionRow } from "@/lib/billing/server";
import { PLANS, priceCents, yearlySavingsCents } from "@/lib/billing/plans";

const now = new Date("2026-11-20T12:00:00Z");
const free = PLANS.free.limits;
const pro = PLANS.pro.limits;

function orders(count: number, date: string) {
  return Array.from({ length: count }, (_, i) => ({ orderId: `${date}-${i}`, creationDate: date }));
}

describe("lockedStoreIds", () => {
  it("Free keeps the first store and locks the rest", () => {
    expect([...lockedStoreIds(["a", "b", "c"], free)]).toEqual(["b", "c"]);
  });
  it("Pro allows three stores", () => {
    expect([...lockedStoreIds(["a", "b", "c", "d"], pro)]).toEqual(["d"]);
  });
  it("Ultimate never locks", () => {
    expect(lockedStoreIds(["a", "b", "c", "d", "e"], PLANS.ultimate.limits).size).toBe(0);
  });
});

describe("allowedNewOrderIds", () => {
  it("Free stops at the monthly allowance", () => {
    const { allowed, overLimit } = allowedNewOrderIds(orders(60, "2026-11-05T00:00:00Z"), new Map(), free, now);
    expect(allowed.size).toBe(50);
    expect(overLimit).toBe(10);
  });
  it("orders already imported count toward the month", () => {
    const { allowed, overLimit } = allowedNewOrderIds(orders(10, "2026-11-05T00:00:00Z"), new Map([["2026-11", 45]]), free, now);
    expect(allowed.size).toBe(5);
    expect(overLimit).toBe(5);
  });
  it("each month has its own allowance", () => {
    const list = [...orders(50, "2026-10-05T00:00:00Z"), ...orders(50, "2026-11-05T00:00:00Z")];
    expect(allowedNewOrderIds(list, new Map(), free, now).allowed.size).toBe(100);
  });
  it("earlier orders win when the month runs out", () => {
    const list = [
      { orderId: "late", creationDate: "2026-11-10T00:00:00Z" },
      { orderId: "early", creationDate: "2026-11-01T00:00:00Z" },
    ];
    const { allowed } = allowedNewOrderIds(list, new Map([["2026-11", 49]]), free, now);
    expect([...allowed]).toEqual(["early"]);
  });
  it("skips orders older than the plan's history and orders without a date", () => {
    const list = [
      { orderId: "old", creationDate: "2026-01-01T00:00:00Z" },
      { orderId: "nodate" },
      { orderId: "ok", creationDate: "2026-11-01T00:00:00Z" },
    ];
    expect([...allowedNewOrderIds(list, new Map(), free, now).allowed]).toEqual(["ok"]);
  });
  it("Pro has no monthly limit", () => {
    const { allowed, overLimit } = allowedNewOrderIds(orders(500, "2026-11-05T00:00:00Z"), new Map(), pro, now);
    expect(allowed.size).toBe(500);
    expect(overLimit).toBe(0);
  });
});

function row(fields: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    userId: "u1",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: "free",
    billingInterval: null,
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    comped: false,
    trialEndsAt: null,
    ...fields,
  };
}

describe("free trial", () => {
  const future = "2026-11-25T12:00:00Z";
  const past = "2026-11-10T12:00:00Z";

  it("a running trial gives Pro", () => {
    expect(planForRow(row({ trialEndsAt: future }), now)).toEqual({ plan: "pro", trialActive: true });
  });
  it("an ended trial goes back to Free", () => {
    expect(planForRow(row({ trialEndsAt: past }), now)).toEqual({ plan: "free", trialActive: false });
  });
  it("a payment wins over the trial", () => {
    const paid = row({ trialEndsAt: future, plan: "ultimate", status: "active", stripeSubscriptionId: "sub_1" });
    expect(planForRow(paid, now)).toEqual({ plan: "ultimate", trialActive: false });
  });
  it("a cancelled payment falls back to a trial that's still running", () => {
    expect(planForRow(row({ trialEndsAt: future, plan: "pro", status: "canceled" }), now).trialActive).toBe(true);
  });
  it("comped accounts are never in a trial", () => {
    expect(planForRow(row({ comped: true, plan: "ultimate", trialEndsAt: future }), now)).toEqual({ plan: "ultimate", trialActive: false });
  });
  it("only one trial per account, and never after paying", () => {
    expect(trialEligible(null, "free")).toBe(true);
    expect(trialEligible(row({}), "free")).toBe(true);
    expect(trialEligible(row({ trialEndsAt: past }), "free")).toBe(false);
    expect(trialEligible(row({ stripeSubscriptionId: "sub_old", status: "canceled" }), "free")).toBe(false);
    expect(trialEligible(row({ comped: true }), "free")).toBe(false);
    expect(trialEligible(row({}), "pro")).toBe(false);
  });
});

describe("prices", () => {
  it("yearly plans save money", () => {
    for (const plan of ["pro", "ultimate"] as const) {
      expect(priceCents(plan, "year")).toBeLessThan(priceCents(plan, "month") * 12);
      expect(yearlySavingsCents(plan)).toBe(priceCents(plan, "month") * 12 - priceCents(plan, "year"));
    }
  });
});
