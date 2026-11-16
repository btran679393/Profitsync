import { describe, expect, it } from "vitest";
import {
  buildInventory,
  daysBetween,
  parseDollars,
  parseQuantity,
  splitPurchaseCost,
  type InventoryItem,
  type InventorySale,
  type Purchase,
} from "@/lib/inventory";

const purchase = (id: number, purchasedOn: string, source = "Goodwill"): Purchase => ({
  id,
  ebayUserId: "store-a",
  purchasedOn,
  source,
  note: null,
});

const item = (id: number, purchaseId: number, over: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  purchaseId,
  name: `Item ${id}`,
  quantity: 1,
  unitCost: 10,
  ebayItemId: null,
  ...over,
});

const sale = (ebayItemId: string, orderDate: string, over: Partial<InventorySale> = {}): InventorySale => ({
  ebayItemId,
  orderDate,
  quantity: 1,
  revenue: 50,
  fees: 7,
  shipping: 5,
  ...over,
});

describe("splitPurchaseCost", () => {
  it("splits evenly per unit without estimates", () => {
    const split = splitPurchaseCost(3000, [{ quantity: 1 }, { quantity: 2 }]);
    expect(split.map((s) => s.lineCents)).toEqual([1000, 2000]);
    expect(split.map((s) => s.unitCost)).toEqual([10, 10]);
  });

  it("follows expected sale prices when every line has one", () => {
    const split = splitPurchaseCost(5000, [
      { quantity: 1, estimate: 200 },
      { quantity: 1, estimate: 50 },
    ]);
    expect(split.map((s) => s.lineCents)).toEqual([4000, 1000]);
  });

  it("falls back to an even split when an estimate is missing", () => {
    const split = splitPurchaseCost(5000, [{ quantity: 1, estimate: 200 }, { quantity: 1 }]);
    expect(split.map((s) => s.lineCents)).toEqual([2500, 2500]);
  });

  it("line totals always add up to the price", () => {
    const split = splitPurchaseCost(1000, [{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }]);
    expect(split.reduce((sum, s) => sum + s.lineCents, 0)).toBe(1000);
    expect(split.map((s) => s.lineCents).sort()).toEqual([333, 333, 334]);
  });

  it("handles nothing to split", () => {
    expect(splitPurchaseCost(1000, [])).toEqual([]);
  });
});

describe("buildInventory", () => {
  it("counts what sold, what's left and days to sell", () => {
    const report = buildInventory(
      [purchase(1, "2026-09-01")],
      [item(1, 1, { quantity: 3, unitCost: 10, ebayItemId: "L1" })],
      [sale("L1", "2026-09-11T15:00:00Z"), sale("L1", "2026-09-21T15:00:00Z")],
      "2026-10-01"
    );
    const stats = report.items[0];
    expect(stats.sold).toBe(2);
    expect(stats.remaining).toBe(1);
    expect(stats.status).toBe("listed");
    expect(stats.avgDaysToSell).toBe(15);
    expect(stats.revenue).toBe(100);
    expect(stats.cogs).toBe(20);
    expect(stats.profit).toBe(100 - 14 - 10 - 20);
    expect(stats.lastSoldOn).toBe("2026-09-21");
  });

  it("hands a listing's sales to the oldest purchase first", () => {
    const report = buildInventory(
      [purchase(1, "2026-08-01"), purchase(2, "2026-09-01")],
      [
        item(1, 1, { quantity: 1, unitCost: 5, ebayItemId: "L1" }),
        item(2, 2, { quantity: 2, unitCost: 8, ebayItemId: "L1" }),
      ],
      [sale("L1", "2026-09-05T10:00:00Z", { quantity: 2, revenue: 100, fees: 10, shipping: 0 })],
      "2026-10-01"
    );
    const [first, second] = report.items;
    expect(first.sold).toBe(1);
    expect(first.status).toBe("sold-out");
    expect(second.sold).toBe(1);
    expect(second.remaining).toBe(1);
    expect(first.revenue).toBe(50);
    expect(second.revenue).toBe(50);
  });

  it("never counts a sale against stock bought after it", () => {
    const report = buildInventory(
      [purchase(1, "2026-09-10")],
      [item(1, 1, { ebayItemId: "L1" })],
      [sale("L1", "2026-09-01T10:00:00Z")],
      "2026-10-01"
    );
    expect(report.items[0].sold).toBe(0);
  });

  it("tells whether a purchase has paid for itself", () => {
    const report = buildInventory(
      [purchase(1, "2026-09-01", "Estate sale")],
      [
        item(1, 1, { quantity: 1, unitCost: 30, ebayItemId: "L1" }),
        item(2, 1, { quantity: 1, unitCost: 20 }),
      ],
      [sale("L1", "2026-09-05T10:00:00Z", { revenue: 80, fees: 10, shipping: 8 })],
      "2026-10-01"
    );
    const trip = report.purchases[0];
    expect(trip.spent).toBe(50);
    expect(trip.netProceeds).toBe(62);
    expect(trip.paidBack).toBe(12);
    expect(trip.paidOff).toBe(true);
    expect(trip.sellThrough).toBe(0.5);
    expect(trip.unsoldCost).toBe(20);
    expect(trip.profitOnSold).toBe(62 - 30);
  });

  it("adds up unsold, unlisted and aging stock", () => {
    const report = buildInventory(
      [purchase(1, "2026-07-01"), purchase(2, "2026-09-25")],
      [
        item(1, 1, { quantity: 2, unitCost: 15 }),
        item(2, 2, { quantity: 1, unitCost: 40, ebayItemId: "L2" }),
      ],
      [],
      "2026-10-01",
      60
    );
    expect(report.totals.remaining).toBe(3);
    expect(report.totals.unsoldCost).toBe(70);
    expect(report.totals.notListedUnits).toBe(2);
    expect(report.totals.agedUnits).toBe(2);
    expect(report.totals.agedCost).toBe(30);
    expect(report.totals.sellThrough).toBe(0);
    expect(report.totals.avgDaysToSell).toBeNull();
  });

  it("lists newest purchases first", () => {
    const report = buildInventory([purchase(1, "2026-08-01"), purchase(2, "2026-09-01")], [], [], "2026-10-01");
    expect(report.purchases.map((p) => p.purchase.id)).toEqual([2, 1]);
  });
});

describe("helpers", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-09-01", "2026-09-11T23:00:00Z")).toBe(10);
    expect(daysBetween("2026-09-11", "2026-09-01")).toBe(0);
  });
  it("reads dollars and quantities", () => {
    expect(parseDollars("12.5")).toBe(1250);
    expect(parseDollars("-1")).toBeNull();
    expect(parseDollars("1.234")).toBeNull();
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1.5")).toBeNull();
  });
});
