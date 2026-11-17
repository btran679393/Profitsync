import { describe, expect, it } from "vitest";
import type { ApiListing, Order } from "@/app/dashboard/model";
import { NOT_KNOWN, bestAndWorst, monthLabel, monthlyReport, profitBy, repeatBuyers } from "@/lib/reports";
import { parseItemDetails } from "@/lib/ebay/itemDetails";
import { PLANS } from "@/lib/billing/plans";

// Sale $100, fees $13, cost $40, no shipping: $47 profit.
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
    orderDate: "2026-10-15T12:00:00",
    ...overrides,
  };
}

const listing = (id: string, categoryName: string | null, brand: string | null): ApiListing =>
  ({ ebayItemId: id, title: id, categoryName, brand }) as ApiListing;

const now = new Date(2026, 10, 17); // Nov 17, 2026

describe("month by month", () => {
  it("covers the last N months, oldest first, with profit after expenses", () => {
    const rows = monthlyReport(
      [order({ orderDate: "2026-10-15T12:00:00" }), order({ orderDate: "2026-11-02T12:00:00" }), order({ orderDate: "2026-11-03T12:00:00" })],
      [{ date: "2026-11-05", amount: "10" }],
      3,
      now
    );
    expect(rows.map((r) => r.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(rows[0]).toMatchObject({ orders: 0, sales: 0, profit: 0, margin: null });
    expect(rows[1]).toMatchObject({ orders: 1, sales: 100, profit: 47 });
    expect(rows[2]).toMatchObject({ orders: 2, sales: 200, profit: 84 });
  });

  it("picks the best and slowest finished months (not the month in progress)", () => {
    const rows = monthlyReport(
      [
        order({ orderDate: "2026-09-15T12:00:00" }),
        order({ orderDate: "2026-10-15T12:00:00" }),
        order({ orderDate: "2026-10-16T12:00:00" }),
        // November is in progress and has one sale: not "slowest".
        order({ orderDate: "2026-11-02T12:00:00", salePrice: 50 }),
      ],
      [],
      3,
      now
    );
    const { best, worst, average } = bestAndWorst(rows);
    expect(best?.key).toBe("2026-10");
    expect(worst?.key).toBe("2026-09");
    expect(average).toBe(70.5);
    // With only the current month, it's used rather than showing nothing.
    const onlyNow = bestAndWorst(monthlyReport([order({ orderDate: "2026-11-02T12:00:00" })], [], 3, now));
    expect(onlyNow.best?.key).toBe("2026-11");
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(monthLabel("2026-11", true)).toBe("Nov 26");
  });

  it("counts orders without a cost as sales, not profit", () => {
    const [row] = monthlyReport([order({ orderDate: "2026-11-02T12:00:00", productCost: "", savedProductCost: "" })], [], 1, now);
    expect(row).toMatchObject({ sales: 100, profit: 0, missingCost: 1 });
  });
});

describe("profit by category and brand", () => {
  const listings = [listing("A", "Film Cameras", "Canon"), listing("B", "Jeans", "Levi's"), listing("C", "Film Cameras", null)];

  it("groups sales and profit, best first, with unknown last", () => {
    const rows = profitBy(
      [order({ ebayItemId: "A" }), order({ ebayItemId: "C", salePrice: 200 }), order({ ebayItemId: "B" }), order({ ebayItemId: "Z" })],
      listings,
      "categoryName"
    );
    expect(rows.map((r) => r.name)).toEqual(["Film Cameras", "Jeans", NOT_KNOWN]);
    expect(rows[0]).toMatchObject({ sales: 300, profit: 47 + 147, units: 2, orders: 2 });
    expect(rows[0].margin).toBeCloseTo(64.7, 1);
  });

  it("uses brand when asked, and leaves cancelled orders out", () => {
    const rows = profitBy([order({ ebayItemId: "A" }), order({ ebayItemId: "A", status: "CANCELED" })], listings, "brand");
    expect(rows).toEqual([{ name: "Canon", sales: 100, profit: 47, units: 1, orders: 1, margin: 47, missingCost: 0 }]);
  });

  it("folds small groups into 'Everything else'", () => {
    const many = Array.from({ length: 12 }, (_, i) => listing(`L${i}`, `Cat ${i}`, null));
    const rows = profitBy(many.map((l, i) => order({ ebayItemId: l.ebayItemId, salePrice: 100 + i })), many, "categoryName", 8);
    expect(rows).toHaveLength(9);
    expect(rows[8].name).toBe("Everything else (4)");
    expect(rows[8].orders).toBe(4);
  });
});

describe("repeat buyers", () => {
  it("finds buyers who came back and their share of sales", () => {
    const result = repeatBuyers([
      order({ ebayBuyerId: "amy", orderDate: "2026-10-01T12:00:00" }),
      order({ ebayBuyerId: "amy", orderDate: "2026-11-01T12:00:00" }),
      order({ ebayBuyerId: "bob" }),
      order({ ebayBuyerId: "cat", status: "CANCELED" }),
      order({ ebayBuyerId: null }),
    ]);
    expect(result).toMatchObject({ buyers: 2, repeatBuyers: 1 });
    expect(result.repeatSalesShare).toBeCloseTo(66.7, 1);
    expect(result.top[0]).toMatchObject({ buyer: "amy", orders: 2, spent: 200, profit: 94, lastOrder: "2026-11-01T12:00:00" });
  });
});

describe("eBay item details", () => {
  it("reads the most specific category and the brand", () => {
    expect(
      parseItemDetails({
        categoryPath: "Sports Mem, Cards & Fan Shop|Fan Apparel & Souvenirs|Soccer-International Clubs",
        brand: "Umbro",
      })
    ).toEqual({
      category: "Soccer-International Clubs",
      categoryPath: "Sports Mem, Cards & Fan Shop|Fan Apparel & Souvenirs|Soccer-International Clubs",
      brand: "Umbro",
    });
  });

  it("falls back to the Brand item detail and skips placeholders", () => {
    expect(parseItemDetails({ localizedAspects: [{ name: "Brand", value: "Nike" }] }).brand).toBe("Nike");
    expect(parseItemDetails({ brand: "Unbranded" }).brand).toBeNull();
    expect(parseItemDetails(null)).toEqual({ category: null, categoryPath: null, brand: null });
  });

  it("is part of Pro and Ultimate", () => {
    expect([PLANS.free.limits.reports, PLANS.pro.limits.reports, PLANS.ultimate.limits.reports]).toEqual([false, true, true]);
  });
});
