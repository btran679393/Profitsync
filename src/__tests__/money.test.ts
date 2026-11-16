import { describe, expect, it } from "vitest";
import {
  EBAY_CHARGE_CATEGORIES,
  chargeCategory,
  feesByOrder,
  getBuyerRefundInfo,
  getRefundStatus,
  monthlyUnattachedCharges,
  netChargesByOrder,
  parseMoney,
  sellerSaleCents,
} from "@/lib/ebay/money";

const usd = (value: string) => ({ value, currency: "USD" });

describe("parseMoney", () => {
  it("reads dollars as cents", () => {
    expect(parseMoney(usd("12.34"))).toBe(1234);
    expect(parseMoney(usd("-5"))).toBe(-500);
  });
  it("refuses other currencies and odd numbers", () => {
    expect(parseMoney({ value: "10.00", currency: "GBP" })).toBeNull();
    expect(parseMoney(usd("1.234"))).toBeNull();
    expect(parseMoney(usd("abc"))).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });
});

describe("sellerSaleCents (revenue is the sale, never the payout or sales tax)", () => {
  it("takes the sales tax eBay collects out of the buyer's total", () => {
    expect(sellerSaleCents({ pricingSummary: { total: usd("108.00"), tax: usd("8.00") } })).toBe(10000);
  });
  it("uses the total when there's no tax", () => {
    expect(sellerSaleCents({ pricingSummary: { total: usd("50.00") } })).toBe(5000);
  });
  it("gives null without a usable total", () => {
    expect(sellerSaleCents({ pricingSummary: {} })).toBeNull();
  });
});

describe("getBuyerRefundInfo", () => {
  const order = (refund: string, status = "REFUNDED") => ({
    pricingSummary: { total: usd("108.00"), tax: usd("8.00") },
    paymentSummary: { refunds: [{ refundId: "r1", refundAmount: usd(refund), refundStatus: status, refundDate: "2026-11-02T10:00:00Z" }] },
  });
  it("a full refund equals the sale, not sale plus tax again", () => {
    expect(getBuyerRefundInfo(order("108.00"))?.amountCents).toBe(10000);
  });
  it("a partial refund is scaled to the pre-tax sale", () => {
    expect(getBuyerRefundInfo(order("54.00"))?.amountCents).toBe(5000);
  });
  it("ignores refunds that haven't completed", () => {
    expect(getBuyerRefundInfo(order("54.00", "PENDING"))).toBeUndefined();
  });
  it("counts the same refund only once", () => {
    const twice = order("20.00");
    twice.paymentSummary.refunds.push({ ...twice.paymentSummary.refunds[0] });
    expect(getBuyerRefundInfo(twice)?.amountCents).toBe(Math.round((2000 * 10000) / 10800));
  });
});

describe("getRefundStatus", () => {
  it("tells full from partial", () => {
    expect(getRefundStatus(10000, 10000)).toBe("REFUNDED");
    expect(getRefundStatus(10000, 9999)).toBe("REFUNDED");
    expect(getRefundStatus(10000, 2500)).toBe("PARTIALLY_REFUNDED");
    expect(getRefundStatus(10000, 0)).toBe("COST_NEEDED");
  });
});

describe("feesByOrder", () => {
  it("adds up every SALE record for an order", () => {
    const fees = feesByOrder([
      { orderId: "A", totalFeeAmount: usd("13.25") },
      { orderId: "A", totalFeeAmount: usd("0.40") },
      { orderId: "B", totalFeeAmount: usd("2.00") },
      { orderId: "C", totalFeeAmount: { value: "1.00", currency: "EUR" } },
      { totalFeeAmount: usd("9.99") },
    ]);
    expect(fees.get("A")).toBe(1365);
    expect(fees.get("B")).toBe(200);
    expect(fees.has("C")).toBe(false);
    expect(fees.size).toBe(2);
  });
});

describe("netChargesByOrder (labels and order-level ad fees)", () => {
  it("takes credits (voided labels) off whatever sign eBay uses", () => {
    const totals = netChargesByOrder([
      { orderId: "A", amount: usd("-7.50"), bookingEntry: "DEBIT" },
      { orderId: "A", amount: usd("7.50"), bookingEntry: "CREDIT" },
      { orderId: "A", amount: usd("8.10"), bookingEntry: "DEBIT" },
      { orderId: "B", amount: usd("4.00"), bookingEntry: "DEBIT" },
      { amount: usd("30.00"), bookingEntry: "DEBIT" },
    ]);
    expect(totals.get("A")).toBe(810);
    expect(totals.get("B")).toBe(400);
    expect(totals.size).toBe(2);
  });
});

describe("chargeCategory", () => {
  it("sorts eBay fee types into expense categories", () => {
    expect(chargeCategory("SUBSCRIPTION_FEE")).toBe(EBAY_CHARGE_CATEGORIES.subscription);
    expect(chargeCategory("INSERTION_FEE")).toBe(EBAY_CHARGE_CATEGORIES.insertion);
    expect(chargeCategory("AD_FEE")).toBe(EBAY_CHARGE_CATEGORIES.ads);
    expect(chargeCategory("PREMIUM_AD_FEES")).toBe(EBAY_CHARGE_CATEGORIES.ads);
    expect(chargeCategory("BELOW_STANDARD_FEE")).toBe(EBAY_CHARGE_CATEGORIES.other);
    expect(chargeCategory(undefined)).toBe(EBAY_CHARGE_CATEGORIES.other);
  });
});

describe("monthlyUnattachedCharges", () => {
  const charge = (date: string, value: string, feeType: string, bookingEntry = "DEBIT", orderId?: string) => ({
    transactionDate: date,
    amount: usd(value),
    feeType,
    bookingEntry,
    orderId,
  });

  it("groups charges with no order by month and kind, net of credits", () => {
    const months = monthlyUnattachedCharges(
      [
        charge("2026-10-01T08:00:00Z", "27.95", "SUBSCRIPTION_FEE"),
        charge("2026-10-03T08:00:00Z", "0.35", "INSERTION_FEE"),
        charge("2026-10-09T08:00:00Z", "0.35", "INSERTION_FEE"),
        charge("2026-10-10T08:00:00Z", "0.35", "INSERTION_FEE", "CREDIT"),
        charge("2026-11-01T08:00:00Z", "27.95", "SUBSCRIPTION_FEE"),
        // Tied to an order: counted on the order, not as an expense.
        charge("2026-10-05T08:00:00Z", "4.20", "AD_FEE", "DEBIT", "ORDER-1"),
      ],
      new Date("2026-10-01T00:00:00Z")
    );
    expect(months).toEqual([
      { key: "2026-10:eBay insertion fees", month: "2026-10", category: "eBay insertion fees", cents: 35, count: 3 },
      { key: "2026-10:eBay Store subscription", month: "2026-10", category: "eBay Store subscription", cents: 2795, count: 1 },
      { key: "2026-11:eBay Store subscription", month: "2026-11", category: "eBay Store subscription", cents: 2795, count: 1 },
    ]);
  });

  it("leaves out a month that was only partly downloaded", () => {
    const months = monthlyUnattachedCharges(
      [
        charge("2026-08-20T08:00:00Z", "5.00", "INSERTION_FEE"),
        charge("2026-09-02T08:00:00Z", "5.00", "INSERTION_FEE"),
      ],
      new Date("2026-08-18T00:00:00Z")
    );
    expect(months.map((m) => m.month)).toEqual(["2026-09"]);
  });
});
