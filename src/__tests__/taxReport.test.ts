import { describe, expect, it } from "vitest";
import {
  buildTaxReport,
  expensesCsv,
  exportFileName,
  ordersCsv,
  periodLabel,
  profitAndLossCsv,
  type TaxExpense,
  type TaxOrder,
} from "@/lib/taxReport";

const order = (over: Partial<TaxOrder>): TaxOrder => ({
  orderDate: "2025-03-10T15:00:00.000Z",
  refunded: false,
  salePrice: 100,
  ebayFees: 13.25,
  otherFees: 2,
  shipping: 8,
  productCost: 40,
  refundLoss: 0,
  ...over,
});

const orders: TaxOrder[] = [
  order({ ebayOrderId: "12-1", item: "Camera", storeName: "Shop A", storeId: "a" }),
  order({ orderDate: "2025-03-20T10:00:00.000Z", salePrice: 50, ebayFees: 6.5, otherFees: 0, shipping: 5, productCost: null, ebayOrderId: "12-2", item: "=SUM(A1)" }),
  order({ orderDate: "2025-07-02T10:00:00.000Z", refunded: true, salePrice: 80, refundLoss: 12.4, refundUnreviewed: false, ebayOrderId: "12-3", item: 'Jacket, "M"' }),
  // Other years are left out.
  order({ orderDate: "2024-12-31T23:00:00.000Z", salePrice: 999 }),
];

const expenses: TaxExpense[] = [
  { date: "2025-03-01", category: "Packing supplies", amount: "48.60", note: "Mailers", ebayUserId: "a" },
  { date: "2025-07-15", category: "Software", amount: 9.99, ebayUserId: null, repeatMonthly: true },
  { date: "2025-08-15", category: "Software", amount: 9.99, ebayUserId: null, repeatMonthly: true },
  { date: "2026-01-15", category: "Software", amount: 9.99 },
];

describe("buildTaxReport", () => {
  const r = buildTaxReport(orders, expenses, 2025);

  it("adds up the statement", () => {
    expect(r.orderCount).toBe(3);
    expect(r.grossSales).toBe(230);
    expect(r.refunds).toBe(80);
    expect(r.netSales).toBe(150);
    expect(r.cogs).toBe(40);
    expect(r.grossProfit).toBe(110);
    expect(r.ebayFees).toBe(19.75);
    expect(r.otherFees).toBe(2);
    expect(r.shipping).toBe(13);
    expect(r.refundLosses).toBe(12.4);
    expect(r.expenseTotal).toBe(68.58);
    expect(r.totalCosts).toBe(115.73);
    expect(r.netProfit).toBe(-5.73);
    expect(r.missingCost).toBe(1);
  });

  it("splits it by month, and the months add up to the year", () => {
    const march = r.months[2];
    expect(march.orders).toBe(2);
    expect(march.netSales).toBe(150);
    expect(march.expenses).toBe(48.6);
    expect(r.months[6].refunds).toBe(80);
    const sum = r.months.reduce((total, m) => total + m.netProfit, 0);
    expect(Math.round(sum * 100) / 100).toBe(r.netProfit);
    expect(r.expenseCategoryMonths.Software[6]).toBe(9.99);
    expect(r.expenseCategoryMonths.Software[7]).toBe(9.99);
  });

  it("lists expense categories largest first", () => {
    expect(r.expenseCategories).toEqual([
      ["Packing supplies", 48.6],
      ["Software", 19.98],
    ]);
  });
});

describe("spreadsheets", () => {
  const header = { business: "Shop A", year: 2025, preparedOn: new Date("2026-02-01T12:00:00Z") };
  const report = buildTaxReport(orders, expenses, 2025);
  const lines = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

  it("opens correctly in Excel", () => {
    expect(profitAndLossCsv(report, header).startsWith("﻿")).toBe(true);
  });

  it("profit and loss has a column per month and a total that matches", () => {
    const rows = lines(profitAndLossCsv(report, header));
    expect(rows).toContain(",Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,Total");
    const net = rows.find((row) => row.startsWith("NET PROFIT"))!.split(",");
    expect(net).toHaveLength(14);
    expect(net[13]).toBe("-5.73");
    const software = rows.find((row) => row.startsWith("Software"))!.split(",");
    expect(software[7]).toBe("9.99");
    expect(software[13]).toBe("19.98");
    const refunds = rows.find((row) => row.startsWith("Refunds"))!.split(",");
    expect(refunds[13]).toBe("-80.00");
  });

  it("the order list totals match the statement", () => {
    const rows = lines(ordersCsv(orders, header));
    const total = rows.find((row) => row.startsWith("Total"))!.split(",");
    // Sale, refunded, product cost, eBay fees, other, shipping, refund loss, profit
    expect(total.slice(6, 14)).toEqual(["230.00", "80.00", "40.00", "19.75", "2.00", "13.00", "12.40", "62.85"]);
    // Profit before expenses minus expenses is the net profit.
    expect(Math.round((62.85 - report.expenseTotal) * 100) / 100).toBe(report.netProfit);
  });

  it("keeps commas and quotes in their cell and never runs formulas", () => {
    const csv = ordersCsv(orders, header);
    expect(csv).toContain('"Jacket, ""M"""');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("Sold - product cost missing");
  });

  it("lists expenses with where they apply", () => {
    const rows = lines(expensesCsv(expenses, header, (id) => (id === "a" ? "Shop A" : null)));
    expect(rows).toContain("2025-03-01,Packing supplies,Mailers,Shop A,No,48.60");
    expect(rows).toContain("2025-07-15,Software,,Whole business,Yes,9.99");
    expect(rows.at(-1)).toBe("Total,,3 entries,,,68.58");
  });
});

describe("labels", () => {
  it("names files clearly", () => {
    expect(exportFileName("Profit and Loss", 2025, "All stores (2)")).toBe("ProfitSync 2025 Profit and Loss - All stores (2).csv");
    expect(exportFileName("Orders", 2025, 'Bad/Name:*?"')).toBe("ProfitSync 2025 Orders - BadName.csv");
  });

  it("says when the year isn't over yet", () => {
    const today = new Date(2026, 10, 11);
    expect(periodLabel(2026, today)).toBe("January 1 – November 11, 2026 (year to date)");
    expect(periodLabel(2025, today)).toBe("January 1 – December 31, 2025");
  });
});
