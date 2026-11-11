import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { getUserPlan, planFromPrice, stripeConfigured, stripeSecretKey, stripeWebhookSecret, type SubscriptionRow } from "@/lib/billing/server";
import { PLANS, UNLIMITED_LIMITS } from "@/lib/billing/plans";
import { demoExpenses, demoListings, demoOrders } from "@/lib/demo/data";
import { formatOrders, getOrderProfit } from "@/app/dashboard/model";

// A pretend database that returns one subscription row (or an error).
function db(row: Partial<SubscriptionRow> | null, error?: { code: string }) {
  return {
    query: async () => {
      if (error) throw error;
      return { rows: row ? [{ userId: "u1", stripeCustomerId: null, stripeSubscriptionId: null, plan: "free", billingInterval: null, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, comped: false, ...row }] : [] };
    },
  } as never;
}

const savedKey = process.env.STRIPE_SECRET_KEY;
const savedHook = process.env.STRIPE_WEBHOOK_SECRET;
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_example";
});
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = savedKey;
  process.env.STRIPE_WEBHOOK_SECRET = savedHook;
});

describe("which plan a seller is on", () => {
  it("no subscription yet means Free", async () => {
    const plan = await getUserPlan(db(null), "u1");
    expect(plan.plan).toBe("free");
    expect(plan.limits).toEqual(PLANS.free.limits);
  });
  it("an active Pro subscription means Pro", async () => {
    expect((await getUserPlan(db({ plan: "pro", status: "active" }), "u1")).plan).toBe("pro");
  });
  it("a card that's failing (past due) keeps the plan while Stripe retries", async () => {
    expect((await getUserPlan(db({ plan: "ultimate", status: "past_due" }), "u1")).plan).toBe("ultimate");
  });
  it("a cancelled or unpaid subscription falls back to Free", async () => {
    expect((await getUserPlan(db({ plan: "pro", status: "canceled" }), "u1")).plan).toBe("free");
    expect((await getUserPlan(db({ plan: "pro", status: "unpaid" }), "u1")).plan).toBe("free");
    expect((await getUserPlan(db({ plan: "pro", status: "incomplete" }), "u1")).plan).toBe("free");
  });
  it("a free (comped) plan doesn't depend on Stripe", async () => {
    expect((await getUserPlan(db({ plan: "ultimate", comped: true, status: null }), "u1")).plan).toBe("ultimate");
  });
  it("billing stays off (everything unlocked) until Stripe and the table exist", async () => {
    process.env.STRIPE_SECRET_KEY = "";
    expect(await getUserPlan(db(null), "u1")).toMatchObject({ enabled: false, limits: UNLIMITED_LIMITS });
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    expect(await getUserPlan(db(null, { code: "42P01" }), "u1")).toMatchObject({ enabled: false, limits: UNLIMITED_LIMITS });
  });
  it("other database errors aren't hidden", async () => {
    await expect(getUserPlan(db(null, { code: "XX000" }), "u1")).rejects.toMatchObject({ code: "XX000" });
  });
});

describe("Stripe keys", () => {
  it("ignores stray spaces and line breaks around pasted keys", () => {
    process.env.STRIPE_SECRET_KEY = "  sk_live_abc\n";
    process.env.STRIPE_WEBHOOK_SECRET = "\twhsec_123 ";
    expect(stripeSecretKey()).toBe("sk_live_abc");
    expect(stripeWebhookSecret()).toBe("whsec_123");
    expect(stripeConfigured()).toBe(true);
  });
  it("a blank key means billing is off", () => {
    process.env.STRIPE_SECRET_KEY = "   ";
    expect(stripeConfigured()).toBe(false);
  });
});

describe("planFromPrice", () => {
  const price = (p: Partial<Stripe.Price>) => p as Stripe.Price;
  it("reads the plan from the price's details", () => {
    expect(planFromPrice(price({ metadata: { profitsyncPlan: "pro" }, recurring: { interval: "year" } as Stripe.Price.Recurring }))).toEqual({ plan: "pro", interval: "year" });
  });
  it("falls back to the lookup key", () => {
    expect(planFromPrice(price({ metadata: {}, lookup_key: "profitsync_ultimate_month" }))).toEqual({ plan: "ultimate", interval: "month" });
  });
  it("ignores prices that aren't ProfitSync plans", () => {
    expect(planFromPrice(price({ metadata: {}, lookup_key: "something_else" }))).toBeNull();
    expect(planFromPrice(null)).toBeNull();
  });
});

describe("demo data", () => {
  it("is the same on every visit", () => {
    expect(demoOrders()).toEqual(demoOrders());
  });
  it("looks like a real store", () => {
    const orders = formatOrders(demoOrders());
    expect(orders.length).toBeGreaterThan(40);
    expect(orders.some((o) => o.savedProductCost === "")).toBe(true); // some need a cost
    expect(orders.some((o) => o.status === "REFUNDED")).toBe(true);
    const profits = orders.map(getOrderProfit).filter((p): p is number => p !== null);
    expect(profits.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(demoListings().length).toBeGreaterThan(5);
    expect(demoExpenses().some((e) => e.repeatMonthly)).toBe(true);
  });
});
