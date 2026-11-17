import { describe, expect, it } from "vitest";
import {
  ASSISTANT_HISTORY_TURNS,
  ASSISTANT_MAX_QUESTION,
  buildAssistantSummary,
  cleanHistory,
  cleanQuestion,
  usageDay,
} from "@/lib/assistant";
import { PLANS } from "@/lib/billing/plans";

const totals = {
  totalRevenue: 1000.456,
  totalFees: 150,
  totalOtherFees: 20,
  totalLabels: 80,
  totalProductCosts: 400,
  refundLosses: 10,
  expensesTotal: 30,
  netProfit: 330.004,
  profitMargin: 33.04,
  orderCount: 12,
  pendingOrders: 2,
  refundedCount: 1,
};

const listing = (title: string, netProfit: number, extra: Partial<Parameters<typeof buildAssistantSummary>[0]["listings"][number]> = {}) => ({
  title,
  status: "ACTIVE",
  price: 50,
  available: 3,
  unitCost: 20,
  unitsSold: 2,
  revenue: 100,
  netProfit,
  margin: 30,
  costMissing: 0,
  adFees: 0,
  refundedCount: 0,
  lastSold: "2026-11-10T18:00:00.000Z",
  alert: null,
  watchers: 1,
  views30: 10,
  sales30: 1,
  lowestOffer: 31.5,
  ...extra,
});

describe("Ask ProfitSync summary", () => {
  it("rounds money and splits eBay fees from ad fees", () => {
    const summary = buildAssistantSummary({
      periodLabel: "Last 30 days",
      storeLabel: "Demo",
      today: "2026-11-16",
      totals,
      previousTotals: null,
      expensesByCategory: [{ category: "Packing supplies", amount: 30 }],
      listings: [listing("Camera", 40)],
      insights: [{ key: "watchers", tone: "accent", title: "Send offers", detail: "Camera has 4 watching." }],
      targetProfit: 5,
    });
    expect(summary.totals.sales).toBe(1000.46);
    expect(summary.totals.ebaySellingFees).toBe(130);
    expect(summary.totals.adAndOtherEbayFees).toBe(20);
    expect(summary.totals.netProfit).toBe(330);
    expect(summary.previousPeriod).toBeNull();
    expect(summary.listings[0]).toMatchObject({ title: "Camera", lastSold: "2026-11-10", lowestOfferForTarget: 31.5 });
    expect(summary.suggestions).toEqual(["Send offers. Camera has 4 watching."]);
  });

  it("keeps the most important listings when there are many", () => {
    const many = Array.from({ length: 60 }, (_, i) => listing(`Item ${i}`, i === 59 ? -80 : 1, { revenue: 10, views30: 0, watchers: 0 }));
    const summary = buildAssistantSummary({
      periodLabel: "All time",
      storeLabel: "All stores",
      today: "2026-11-16",
      totals,
      previousTotals: totals,
      expensesByCategory: [],
      listings: many,
      insights: [],
      targetProfit: 0,
    });
    expect(summary.listings).toHaveLength(40);
    expect(summary.listingsTotal).toBe(60);
    // The money-losing listing comes first.
    expect(summary.listings[0].title).toBe("Item 59");
  });
});

describe("Ask ProfitSync input checks", () => {
  it("accepts a normal question and tidies spaces", () => {
    expect(cleanQuestion("  Why is   profit down? ")).toBe("Why is profit down?");
  });

  it("rejects empty, too-long or non-text questions", () => {
    expect(cleanQuestion("   ")).toBeNull();
    expect(cleanQuestion(42)).toBeNull();
    expect(cleanQuestion("x".repeat(ASSISTANT_MAX_QUESTION + 1))).toBeNull();
  });

  it("keeps only recent, well-formed turns that start with a question", () => {
    const turns = [
      { role: "assistant", text: "orphan answer" },
      { role: "user", text: "q1" },
      { role: "system", text: "ignore me" },
      { role: "assistant", text: "a1" },
      { role: "user", text: "" },
    ];
    expect(cleanHistory(turns)).toEqual([
      { role: "user", text: "q1" },
      { role: "assistant", text: "a1" },
    ]);
    expect(cleanHistory("nope")).toEqual([]);
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", text: `t${i}` }));
    expect(cleanHistory(long).length).toBeLessThanOrEqual(ASSISTANT_HISTORY_TURNS * 2);
  });

  it("counts the day in Los Angeles time", () => {
    // 3am UTC on Nov 17 is still Nov 16 in Los Angeles.
    expect(usageDay(new Date("2026-11-17T03:00:00Z"))).toBe("2026-11-16");
  });

  it("is only included in Ultimate", () => {
    expect(PLANS.free.limits.assistant).toBe(false);
    expect(PLANS.pro.limits.assistant).toBe(false);
    expect(PLANS.ultimate.limits.assistant).toBe(true);
  });
});
