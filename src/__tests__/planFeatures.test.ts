import { describe, expect, it } from "vitest";
import { PLANS, UNLIMITED_LIMITS } from "@/lib/billing/plans";

describe("which plan gets the new features", () => {
  it("Free has none of them", () => {
    const l = PLANS.free.limits;
    expect([l.payouts, l.inventory, l.buyerInterest, l.mileage, l.form1099k]).toEqual([false, false, false, false, false]);
  });

  it("Pro gets Payouts, Inventory and views & watchers, not mileage or the 1099-K check", () => {
    const l = PLANS.pro.limits;
    expect([l.payouts, l.inventory, l.buyerInterest]).toEqual([true, true, true]);
    expect([l.mileage, l.form1099k]).toEqual([false, false]);
  });

  it("Ultimate gets everything", () => {
    const l = PLANS.ultimate.limits;
    expect([l.payouts, l.inventory, l.buyerInterest, l.mileage, l.form1099k]).toEqual([true, true, true, true, true]);
  });

  it("before billing is switched on, everyone has everything", () => {
    expect(UNLIMITED_LIMITS.mileage && UNLIMITED_LIMITS.form1099k && UNLIMITED_LIMITS.payouts).toBe(true);
  });

  it("the plan cards list them", () => {
    expect(PLANS.pro.features.join(" ")).toMatch(/Payouts[^]*Inventory[^]*views and watchers/);
    expect(PLANS.ultimate.features.join(" ")).toMatch(/Mileage[^]*1099-K/);
  });
});
