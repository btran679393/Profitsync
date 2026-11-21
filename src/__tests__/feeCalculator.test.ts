import { describe, expect, it } from "vitest";
import { calculateFees, feeCategory, finalValueFee, type FeeInput } from "@/lib/feeCalculator";

const base: FeeInput = {
  categoryId: "most",
  itemPrice: 50,
  shippingCharged: 0,
  salesTaxPercent: 0,
  itemCost: 0,
  shippingLabel: 0,
  adRatePercent: 0,
  international: false,
};

describe("finalValueFee", () => {
  it("most categories: 13.6% up to $7,500, 2.35% on the rest", () => {
    expect(finalValueFee(feeCategory("most"), 100)).toBeCloseTo(13.6);
    expect(finalValueFee(feeCategory("most"), 10000)).toBeCloseTo(7500 * 0.136 + 2500 * 0.0235);
  });
  it("watches use three bands", () => {
    expect(finalValueFee(feeCategory("watches"), 8000)).toBeCloseTo(150 + 6500 * 0.065 + 500 * 0.03);
  });
  it("handbags use one rate for the whole sale", () => {
    expect(finalValueFee(feeCategory("handbags"), 2000)).toBeCloseTo(300);
    expect(finalValueFee(feeCategory("handbags"), 2500)).toBeCloseTo(225);
  });
  it("sneakers: 8% from $150, normal rate below", () => {
    expect(finalValueFee(feeCategory("sneakers"), 200)).toBeCloseTo(16);
    expect(finalValueFee(feeCategory("sneakers"), 100)).toBeCloseTo(13.6);
  });
  it("an unknown category falls back to most categories", () => {
    expect(feeCategory("nope").id).toBe("most");
  });
});

describe("calculateFees", () => {
  it("charges the fee on item, shipping and sales tax", () => {
    const result = calculateFees({ ...base, itemPrice: 40, shippingCharged: 10, salesTaxPercent: 10 });
    expect(result.salesTax).toBe(5);
    expect(result.totalSale).toBe(55);
    expect(result.finalValueFee).toBe(7.48);
    expect(result.perOrderFee).toBe(0.4);
    // The tax isn't the seller's money.
    expect(result.youReceive).toBe(50);
  });
  it("per-order fee is $0.30 at $10 or less", () => {
    expect(calculateFees({ ...base, itemPrice: 10 }).perOrderFee).toBe(0.3);
    expect(calculateFees({ ...base, itemPrice: 10.01 }).perOrderFee).toBe(0.4);
  });
  it("no per-order fee on $150+ sneakers", () => {
    expect(calculateFees({ ...base, categoryId: "sneakers", itemPrice: 150 }).perOrderFee).toBe(0);
  });
  it("profit takes off fees, label and item cost", () => {
    const result = calculateFees({ ...base, itemPrice: 100, itemCost: 20, shippingLabel: 8, adRatePercent: 5 });
    // 13.60 fee + 0.40 per order + 5.00 ad
    expect(result.totalFees).toBe(19);
    expect(result.profit).toBe(53);
    expect(result.marginPercent).toBe(53);
    expect(result.roiPercent).toBe(265);
  });
  it("international fee is 1.65% of the total", () => {
    expect(calculateFees({ ...base, itemPrice: 100, international: true }).internationalFee).toBe(1.65);
  });
  it("ignores bad numbers and an empty sale", () => {
    const result = calculateFees({ ...base, itemPrice: Number.NaN, itemCost: -5 });
    expect(result.totalFees).toBe(0);
    expect(result.profit).toBe(0);
    expect(result.marginPercent).toBeNull();
    expect(result.roiPercent).toBeNull();
  });
});
