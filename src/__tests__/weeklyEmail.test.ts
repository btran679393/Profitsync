import { describe, expect, it } from "vitest";
import { formatOrders, type ApiOrder } from "@/app/dashboard/model";
import { escapeHtml, renderWeeklyEmail, weeklySummary, worthSending } from "@/lib/email/weekly";

const now = new Date("2026-11-23T14:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function order(over: Partial<ApiOrder>): ApiOrder {
  return {
    id: Math.floor(Math.random() * 1e9),
    ebayOrderId: null,
    ebayBuyerId: null,
    item: "Card",
    salePrice: 50,
    ebayFees: 7,
    productCost: 10,
    status: "COMPLETED",
    orderDate: daysAgo(1),
    quantity: 1,
    shippingLabelCost: 5,
    ...over,
  };
}

describe("weekly summary numbers", () => {
  it("adds up this week's profit and compares with the week before", () => {
    const orders = formatOrders([
      order({ item: "Pikachu", salePrice: 100, ebayFees: 13, productCost: 20 }), // 100-13-5-20 = 62
      order({ item: "Mew", salePrice: 40, ebayFees: 5, productCost: 10, orderDate: daysAgo(3) }), // 40-5-5-10 = 20
      order({ item: "Old", salePrice: 60, ebayFees: 8, productCost: 10, orderDate: daysAgo(9) }), // previous week: 37
      order({ item: "Ancient", orderDate: daysAgo(20) }), // ignored
    ]);
    const s = weeklySummary(orders, now);
    expect(s.profit).toBe(82);
    expect(s.previousProfit).toBe(37);
    expect(s.orders).toBe(2);
    expect(s.revenue).toBe(140);
    expect(s.best).toEqual({ item: "Pikachu", profit: 62 });
  });

  it("counts orders without a cost, losing orders and refunds", () => {
    const orders = formatOrders([
      order({ productCost: null }),
      order({ salePrice: 10, ebayFees: 2, productCost: 20 }), // loses money
      order({ status: "REFUNDED", refundAmount: 50 }),
    ]);
    const s = weeklySummary(orders, now);
    expect(s.weekNeedsCost).toBe(1);
    expect(s.losing).toBe(1);
    expect(s.refunds.count).toBe(1);
    expect(s.refunds.amount).toBe(50);
  });
});

describe("weekly email", () => {
  const extras = { firstName: "Sam", needsCost: 3, reconnect: [{ store: "btcardvault", daysLeft: 5 }], appUrl: "https://x.app", unsubscribeUrl: "https://x.app/u?a=1&b=2" };

  it("escapes item titles so they can't inject HTML", () => {
    const orders = formatOrders([order({ item: '<img src=x onerror="alert(1)">', salePrice: 100 })]);
    const { html } = renderWeeklyEmail(weeklySummary(orders, now), extras);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("includes the to-do items and the unsubscribe link", () => {
    const orders = formatOrders([order({})]);
    const { subject, text, html } = renderWeeklyEmail(weeklySummary(orders, now), extras);
    expect(subject).toContain("profit");
    expect(text).toContain("3 orders need a product cost");
    expect(text).toContain("btcardvault runs out in 5 days");
    expect(html).toContain(escapeHtml(extras.unsubscribeUrl));
  });

  it("skips sellers with nothing to report", () => {
    const quiet = weeklySummary([], now);
    expect(worthSending(quiet, { needsCost: 0, reconnect: [] })).toBe(false);
    expect(worthSending(quiet, { needsCost: 1, reconnect: [] })).toBe(true);
  });
});
