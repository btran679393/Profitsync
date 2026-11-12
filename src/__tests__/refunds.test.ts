import { describe, expect, it } from "vitest";
import { orderIsCanceled, refundIsFull, refundIsPartial } from "@/lib/refunds";

const sale = { status: "PARTIALLY_REFUNDED", salePrice: 69.99, ebayFees: 10.7 };

describe("full or partial refund", () => {
  it("counts a refund of the sale after eBay's fees as full", () => {
    // eBay's records: $69.99 sale, $10.70 fees given back, $59.29 refunded.
    expect(refundIsFull({ ...sale, refundAmount: 59.29 })).toBe(true);
    expect(refundIsPartial({ ...sale, refundAmount: 59.29 })).toBe(false);
    expect(refundIsFull({ ...sale, refundAmount: 69.99 })).toBe(true);
  });

  it("counts a smaller refund as partial", () => {
    expect(refundIsFull({ ...sale, refundAmount: 15 })).toBe(false);
    expect(refundIsPartial({ ...sale, refundAmount: 15 })).toBe(true);
    expect(refundIsPartial({ ...sale, refundAmount: 59.27 })).toBe(true);
  });

  it("trusts eBay's REFUNDED status and treats an unknown amount as full", () => {
    expect(refundIsFull({ ...sale, status: "REFUNDED", refundAmount: 0 })).toBe(true);
    expect(refundIsFull({ ...sale, refundAmount: 0 })).toBe(true);
  });

  it("leaves orders with no refund alone", () => {
    expect(refundIsFull({ ...sale, status: "COMPLETED", refundAmount: 0 })).toBe(false);
    expect(refundIsPartial({ ...sale, status: "COMPLETED", refundAmount: 0 })).toBe(false);
  });
});

describe("cancelled orders", () => {
  it("are out of sales, whether eBay or the seller marked them", () => {
    expect(orderIsCanceled({ status: "CANCELED" })).toBe(true);
    expect(orderIsCanceled({ status: "PARTIALLY_REFUNDED", refundOutcome: "CANCELED" })).toBe(true);
    expect(orderIsCanceled({ status: "REFUNDED", refundOutcome: "RETURNED" })).toBe(false);
    expect(refundIsFull({ ...sale, status: "CANCELED", refundAmount: 0 })).toBe(true);
    expect(refundIsPartial({ ...sale, status: "CANCELED", refundAmount: 10 })).toBe(false);
  });
});
