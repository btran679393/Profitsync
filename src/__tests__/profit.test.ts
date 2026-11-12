import { describe, expect, it } from "vitest";
import {
  computeTotals,
  formatOrders,
  getOrderProfit,
  getRefundLoss,
  getShippingCost,
  hasRecordedCost,
  isFullyRefunded,
  isPartiallyRefunded,
  isValidCost,
  previousRange,
  percentChange,
  type ApiOrder,
  type Order,
} from "@/app/dashboard/model";

// One order with sensible defaults; override what a test cares about.
function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    ebayUserId: "store-a",
    shippingLabelCost: 0,
    otherFees: 0,
    shippingCost: "",
    savedShippingCost: "",
    storeShipping: 0,
    ebayOrderId: "1-1",
    ebayBuyerId: null,
    ebayItemId: null,
    quantity: 1,
    item: "Test item",
    imageUrl: null,
    salePrice: 100,
    ebayFees: 13,
    productCost: "40",
    savedProductCost: "40",
    refundAmount: 0,
    refundedAt: null,
    refundOutcome: null,
    refundShippingLoss: 0,
    refundFeeLoss: 0,
    status: "PAID",
    orderDate: "2026-10-15T12:00:00Z",
    ...overrides,
  };
}

describe("isValidCost", () => {
  it("accepts dollars and cents", () => {
    expect(isValidCost("0")).toBe(true);
    expect(isValidCost("12")).toBe(true);
    expect(isValidCost(" 12.5 ")).toBe(true);
    expect(isValidCost("12.50")).toBe(true);
  });
  it("rejects blanks, negatives, extra decimals and text", () => {
    for (const bad of ["", "  ", "-1", "1.234", "abc", "1e3", "$5"]) expect(isValidCost(bad)).toBe(false);
  });
});

describe("getShippingCost", () => {
  it("uses the typed amount first, even if a label was bought", () => {
    expect(getShippingCost(order({ savedShippingCost: "4.25", shippingLabelCost: 9, storeShipping: 5 }))).toBe(4.25);
  });
  it("a typed 0 means free shipping, not 'not set'", () => {
    expect(getShippingCost(order({ savedShippingCost: "0.00", shippingLabelCost: 9 }))).toBe(0);
  });
  it("falls back to the eBay label, then the store default", () => {
    expect(getShippingCost(order({ shippingLabelCost: 7.1, storeShipping: 5 }))).toBe(7.1);
    expect(getShippingCost(order({ storeShipping: 5 }))).toBe(5);
    expect(getShippingCost(order())).toBe(0);
  });
});

describe("getOrderProfit", () => {
  it("is sale minus fees, shipping and product cost", () => {
    // 100 - 13 - 2 - 6 - 40
    expect(getOrderProfit(order({ otherFees: 2, savedShippingCost: "6" }))).toBeCloseTo(39, 10);
  });
  it("is unknown until a product cost is entered", () => {
    expect(getOrderProfit(order({ savedProductCost: "" }))).toBeNull();
    expect(hasRecordedCost(order({ savedProductCost: "" }))).toBe(false);
  });
  it("a cost of 0 still counts as entered", () => {
    expect(getOrderProfit(order({ savedProductCost: "0" }))).toBe(87);
  });
  it("fully refunded orders are left out", () => {
    expect(getOrderProfit(order({ status: "REFUNDED" }))).toBeNull();
    // The sale after the fees eBay gave back ($100 - $13) is a full refund.
    expect(getOrderProfit(order({ refundAmount: 87 }))).toBeNull();
  });
  it("a partial refund comes off the sale", () => {
    // 100 sale - 10 refund - 13 fees - 40 cost
    expect(getOrderProfit(order({ refundAmount: 10, status: "PARTIALLY_REFUNDED" }))).toBe(37);
  });
});

describe("refunds", () => {
  it("tells full refunds from partial ones", () => {
    expect(isFullyRefunded(order())).toBe(false);
    expect(isFullyRefunded(order({ status: "REFUNDED" }))).toBe(true);
    // Marked refunded without an amount: full, to be safe.
    expect(isFullyRefunded(order({ status: "PARTIALLY_REFUNDED" }))).toBe(true);
    expect(isFullyRefunded(order({ refundAmount: 87 }))).toBe(true);
    expect(isFullyRefunded(order({ refundAmount: 5 }))).toBe(false);
    expect(isPartiallyRefunded(order({ refundAmount: 5 }))).toBe(true);
    expect(isPartiallyRefunded(order({ refundAmount: 87 }))).toBe(false);
  });
  it("a partial refund has no refund loss (it's taken off the sale)", () => {
    expect(getRefundLoss(order({ refundAmount: 5, refundOutcome: "RETURNED", refundShippingLoss: 5 }))).toBe(0);
  });
  it("an unreviewed refund has no loss yet", () => {
    expect(getRefundLoss(order({ status: "REFUNDED", refundShippingLoss: 5 }))).toBe(0);
  });
  it("item returned: only shipping and kept fees are lost", () => {
    const o = order({ status: "REFUNDED", refundOutcome: "RETURNED", refundShippingLoss: 5, refundFeeLoss: 1.5 });
    expect(getRefundLoss(o)).toBe(6.5);
  });
  it("item lost: the product cost is lost too", () => {
    const o = order({ status: "REFUNDED", refundOutcome: "SHIPPED_LOST", refundShippingLoss: 5, refundFeeLoss: 1.5 });
    expect(getRefundLoss(o)).toBe(46.5);
  });
  it("orders that weren't refunded never have a refund loss", () => {
    expect(getRefundLoss(order({ refundOutcome: "SHIPPED_LOST", refundShippingLoss: 5 }))).toBe(0);
  });
});

describe("formatOrders", () => {
  const api: ApiOrder = {
    id: 7,
    ebayOrderId: "9-9",
    ebayBuyerId: "buyer",
    item: "Thing",
    salePrice: "25.50",
    ebayFees: "3.30",
    productCost: null,
    status: "PAID",
  };
  it("turns database text into numbers and blanks", () => {
    const [o] = formatOrders([api], 4);
    expect(o.salePrice).toBe(25.5);
    expect(o.ebayFees).toBe(3.3);
    expect(o.savedProductCost).toBe("");
    expect(o.savedShippingCost).toBe("");
    expect(o.storeShipping).toBe(4);
    expect(o.quantity).toBe(1);
    expect(o.refundAmount).toBe(0);
  });
  it("keeps a saved cost and shipping, with shipping to two decimals", () => {
    const [o] = formatOrders([{ ...api, productCost: 0, shippingCost: 3 }]);
    expect(o.savedProductCost).toBe("0");
    expect(o.savedShippingCost).toBe("3.00");
  });
  it("never lets bad numbers go negative", () => {
    const [o] = formatOrders([{ ...api, refundAmount: "-5", shippingLabelCost: "nope", quantity: 0 }]);
    expect(o.refundAmount).toBe(0);
    expect(o.shippingLabelCost).toBe(0);
    expect(o.quantity).toBe(1);
  });
});

describe("computeTotals", () => {
  it("adds up a mixed period", () => {
    const orders = [
      order({ id: 1 }), // profit 47
      order({ id: 2, savedProductCost: "" }), // no cost yet
      order({ id: 3, status: "REFUNDED", refundOutcome: "SHIPPED_LOST", refundShippingLoss: 5 }), // loss 45
    ];
    const totals = computeTotals(orders, [{ amount: "10" }, { amount: 2.5 }]);
    expect(totals.orderCount).toBe(2);
    expect(totals.refundedCount).toBe(1);
    expect(totals.completedCount).toBe(1);
    expect(totals.pendingOrders).toBe(1);
    expect(totals.totalRevenue).toBe(200);
    expect(totals.totalFees).toBe(26);
    expect(totals.totalProductCosts).toBe(40);
    expect(totals.completedProfit).toBe(47);
    expect(totals.refundLosses).toBe(45);
    expect(totals.expensesTotal).toBe(12.5);
    // 47 - 45 - 12.5
    expect(totals.netProfit).toBeCloseTo(-10.5, 10);
    expect(totals.profitMargin).toBeCloseTo(-10.5, 10);
  });
  it("an empty period is all zeros", () => {
    const totals = computeTotals([], []);
    expect(totals.netProfit).toBe(0);
    expect(totals.profitMargin).toBe(0);
    expect(totals.avgProfitPerOrder).toBe(0);
  });
});

describe("previousRange and percentChange", () => {
  it("the previous 7 days end where this range starts", () => {
    const now = new Date(2026, 10, 9, 15, 30);
    const prev = previousRange("7d", now)!;
    expect(prev.end).toEqual(new Date(2026, 10, 3));
    expect(prev.start).toEqual(new Date(2026, 9, 27));
  });
  it("all time has nothing to compare with", () => {
    expect(previousRange("all", new Date())).toBeNull();
  });
  it("percent change skips a zero baseline and handles losses", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
    expect(percentChange(-50, -100)).toBe(50);
  });
});

describe("cancelled orders", () => {
  it("aren't a sale, a refund or a loss", () => {
    const o = order({ status: "CANCELED", refundAmount: 100, refundOutcome: null });
    expect(isFullyRefunded(o)).toBe(true);
    expect(getRefundLoss(o)).toBe(0);
    expect(getOrderProfit(o)).toBeNull();
    const marked = order({ status: "PARTIALLY_REFUNDED", refundAmount: 87, refundOutcome: "CANCELED", refundShippingLoss: 5 });
    expect(getRefundLoss(marked)).toBe(0);
    const totals = computeTotals([order(), o], []);
    expect(totals.refundedCount).toBe(0);
    expect(totals.orderCount).toBe(1);
  });
});
