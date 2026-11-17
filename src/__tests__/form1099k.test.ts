import { describe, expect, it } from "vitest";
import { form1099kCheck, type TaxOrder } from "@/lib/taxReport";

function orders(count: number, price: number, store: string, year = 2026, extra: Partial<TaxOrder> = {}): TaxOrder[] {
  return Array.from({ length: count }, (_, i) => ({
    orderDate: `${year}-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
    refunded: false,
    salePrice: price,
    ebayFees: 0,
    otherFees: 0,
    shipping: 0,
    productCost: 0,
    refundLoss: 0,
    storeId: store,
    storeName: store.toUpperCase(),
    ...extra,
  }));
}

describe("Form 1099-K check", () => {
  it("needs BOTH more than $20,000 and more than 200 sales", () => {
    const [big] = form1099kCheck(orders(201, 100, "a"), 2026, "Store");
    expect(big).toMatchObject({ sales: 201, gross: 20100, status: "over" });

    // Lots of money but only 100 sales: no form federally, but close.
    const [few] = form1099kCheck(orders(100, 250, "b"), 2026, "Store");
    expect(few.status).toBe("close");

    const [small] = form1099kCheck(orders(20, 30, "c"), 2026, "Store");
    expect(small.status).toBe("under");
  });

  it("checks each eBay account on its own and only the chosen year", () => {
    const all = [...orders(150, 100, "a"), ...orders(150, 100, "b"), ...orders(300, 100, "a", 2025)];
    const result = form1099kCheck(all, 2026, "Store");
    expect(result).toHaveLength(2);
    // 300 sales and $30,000 together, but each account is below the limit.
    expect(result.every((s) => s.status !== "over")).toBe(true);
  });

  it("counts refunded sales (the form does) but not cancelled ones", () => {
    const list = [...orders(5, 100, "a", 2026, { refunded: true }), ...orders(5, 100, "a", 2026, { canceled: true })];
    const [store] = form1099kCheck(list, 2026, "Store");
    expect(store).toMatchObject({ sales: 5, gross: 500 });
  });

  it("falls back to the page's store name", () => {
    const [store] = form1099kCheck(orders(1, 10, "x", 2026, { storeId: null, storeName: null }), 2026, "My Store");
    expect(store.name).toBe("My Store");
  });
});
