// The yearly profit and loss statement behind the Taxes page: the numbers
// on screen, the printout and the spreadsheets all come from here, so they
// always agree.

// What the report needs from each order (worked out by the dashboard with
// the same rules as everywhere else in ProfitSync).
export type TaxOrder = {
  orderDate: string | null;
  refunded: boolean;
  salePrice: number;
  ebayFees: number;
  otherFees: number;
  shipping: number;
  productCost: number | null;
  // What a refund cost you (lost item, return shipping, fees kept by eBay).
  refundLoss: number;
  // A refunded order whose outcome (item back, lost…) hasn't been set yet.
  refundUnreviewed?: boolean;
  // Which store it's from (shown in warnings when covering several stores).
  storeName?: string | null;
  storeId?: string | null;
  // For the order list spreadsheet.
  ebayOrderId?: string | null;
  item?: string;
  quantity?: number;
};

export type TaxExpense = {
  date: string; // YYYY-MM-DD this entry counts on
  category: string;
  amount: string | number;
  note?: string | null;
  ebayUserId?: string | null;
  repeatMonthly?: boolean;
};

export type Line = { label: string; amount: number; strong?: boolean; negative?: boolean };

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type MonthRow = {
  month: number; // 0-11
  orders: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  cogs: number;
  ebayFees: number;
  otherFees: number;
  shipping: number;
  refundLosses: number;
  expenses: number;
  netProfit: number;
};

export type TaxReportData = {
  year: number;
  orderCount: number;
  refundCount: number;
  keptCount: number;
  missingCost: number;
  noShipping: number;
  unreviewed: number;
  expenseCount: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  ebayFees: number;
  otherFees: number;
  shipping: number;
  refundLosses: number;
  // Seller-entered expenses by category, largest first.
  expenseCategories: Array<[string, number]>;
  // The same, per month (12 amounts per category).
  expenseCategoryMonths: Record<string, number[]>;
  expenseTotal: number;
  totalCosts: number;
  netProfit: number;
  income: Line[];
  costs: Line[];
  months: MonthRow[];
};

export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function monthOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const month = Number(date.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : null;
}

// Round to cents so totals add up exactly in a spreadsheet.
const cents = (value: number) => Math.round(value * 100) / 100;

function emptyMonth(month: number): MonthRow {
  return {
    month,
    orders: 0,
    grossSales: 0,
    refunds: 0,
    netSales: 0,
    cogs: 0,
    ebayFees: 0,
    otherFees: 0,
    shipping: 0,
    refundLosses: 0,
    expenses: 0,
    netProfit: 0,
  };
}

// What one order adds to the statement. A refunded order's sale is taken
// back out, and only what the refund cost you counts against it.
export function orderAmounts(order: TaxOrder) {
  const kept = !order.refunded;
  const cogs = kept ? order.productCost ?? 0 : 0;
  const ebayFees = kept ? order.ebayFees : 0;
  const otherFees = kept ? order.otherFees : 0;
  const shipping = kept ? order.shipping : 0;
  const refundLoss = kept ? 0 : order.refundLoss;
  const refund = kept ? 0 : order.salePrice;
  return {
    sale: order.salePrice,
    refund,
    cogs,
    ebayFees,
    otherFees,
    shipping,
    refundLoss,
    net: order.salePrice - refund - cogs - ebayFees - otherFees - shipping - refundLoss,
  };
}

export function buildTaxReport(orders: TaxOrder[], expenses: TaxExpense[], year: number): TaxReportData {
  const months = MONTHS.map((_, i) => emptyMonth(i));
  const inYear = orders.filter((order) => yearOf(order.orderDate) === year);
  const kept = inYear.filter((order) => !order.refunded);
  const refunded = inYear.filter((order) => order.refunded);

  for (const order of inYear) {
    const m = months[monthOf(order.orderDate) ?? 0];
    const a = orderAmounts(order);
    m.orders++;
    m.grossSales += a.sale;
    m.refunds += a.refund;
    m.cogs += a.cogs;
    m.ebayFees += a.ebayFees;
    m.otherFees += a.otherFees;
    m.shipping += a.shipping;
    m.refundLosses += a.refundLoss;
  }

  const byCategory = new Map<string, number>();
  const expenseCategoryMonths: Record<string, number[]> = {};
  for (const expense of expenses) {
    if (yearOf(expense.date) !== year) continue;
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount)) continue;
    const month = monthOf(expense.date) ?? 0;
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + amount);
    (expenseCategoryMonths[expense.category] ??= new Array(12).fill(0))[month] += amount;
    months[month].expenses += amount;
  }
  for (const list of Object.values(expenseCategoryMonths)) {
    list.forEach((value, i) => (list[i] = cents(value)));
  }

  for (const m of months) {
    m.netSales = m.grossSales - m.refunds;
    m.netProfit = m.netSales - m.cogs - m.ebayFees - m.otherFees - m.shipping - m.refundLosses - m.expenses;
    for (const key of Object.keys(m) as Array<keyof MonthRow>) {
      if (key !== "month" && key !== "orders") m[key] = cents(m[key]);
    }
  }

  const total = (pick: (m: MonthRow) => number) => cents(months.reduce((sum, m) => sum + pick(m), 0));
  const grossSales = total((m) => m.grossSales);
  const refunds = total((m) => m.refunds);
  const netSales = cents(grossSales - refunds);
  const cogs = total((m) => m.cogs);
  const ebayFees = total((m) => m.ebayFees);
  const otherFees = total((m) => m.otherFees);
  const shipping = total((m) => m.shipping);
  const refundLosses = total((m) => m.refundLosses);
  const expenseCategories = [...byCategory]
    .map(([label, amount]) => [label, cents(amount)] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const expenseTotal = cents(expenseCategories.reduce((sum, [, amount]) => sum + amount, 0));
  const grossProfit = cents(netSales - cogs);
  const totalCosts = cents(ebayFees + otherFees + shipping + refundLosses + expenseTotal);
  const netProfit = cents(grossProfit - totalCosts);

  return {
    year,
    orderCount: inYear.length,
    refundCount: refunded.length,
    keptCount: kept.length,
    missingCost: kept.filter((o) => o.productCost === null).length,
    noShipping: kept.filter((o) => o.shipping <= 0).length,
    unreviewed: refunded.filter((o) => o.refundUnreviewed).length,
    expenseCount: byCategory.size,
    grossSales,
    refunds,
    netSales,
    cogs,
    grossProfit,
    ebayFees,
    otherFees,
    shipping,
    refundLosses,
    expenseCategories,
    expenseCategoryMonths,
    expenseTotal,
    totalCosts,
    netProfit,
    income: [
      { label: "Gross sales", amount: grossSales },
      { label: "Refunds and returns", amount: refunds, negative: true },
      { label: "Net sales", amount: netSales, strong: true },
      { label: "Cost of goods sold (product costs)", amount: cogs, negative: true },
      { label: "Gross profit", amount: grossProfit, strong: true },
    ],
    costs: [
      { label: "eBay selling fees", amount: ebayFees },
      { label: "Other eBay charges (e.g. promoted listings)", amount: otherFees },
      { label: "Shipping and postage", amount: shipping },
      { label: "Losses on refunded orders", amount: refundLosses },
      ...expenseCategories.map(([label, amount]) => ({ label, amount })),
    ],
    months,
  };
}

// "January 1 – December 31, 2026", or "January 1 – November 11, 2026
// (year to date)" for the year in progress.
export function periodLabel(year: number, today = new Date()): string {
  if (year === today.getFullYear()) {
    const through = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return `January 1 – ${through}, ${year} (year to date)`;
  }
  return `January 1 – December 31, ${year}`;
}

// ------------------------------------------------------------
// Spreadsheets (CSV)
// ------------------------------------------------------------

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? value.toFixed(2) : value;
  // Cells starting with = + - @ could run as formulas in Excel; numbers are
  // written as numbers above, so only text needs this.
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  // The byte-order mark makes Excel read "–" and accents correctly.
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// "ProfitSync 2026 Profit and Loss - Demo Collectibles.csv"
export function exportFileName(kind: string, year: number, business: string, extension = "csv"): string {
  const clean = business.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  return `ProfitSync ${year} ${kind}${clean ? ` - ${clean}` : ""}.${extension}`;
}

type Header = { business: string; year: number; preparedOn: Date; today?: Date };

function headerRows(title: string, { business, year, preparedOn, today }: Header) {
  return [
    [`ProfitSync - ${title}`],
    ["Business", business],
    ["Period", periodLabel(year, today ?? preparedOn)],
    ["Prepared", preparedOn.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Currency", "US dollars (USD)"],
    [],
  ];
}

// The statement with a column per month and a Total column.
export function profitAndLossCsv(report: TaxReportData, header: Header): string {
  const row = (label: string, pick: (m: MonthRow) => number, sign = 1) => [
    label,
    ...report.months.map((m) => sign * pick(m)),
    sign * cents(report.months.reduce((sum, m) => sum + pick(m), 0)),
  ];
  const expenseByMonth = (category: string) => (m: MonthRow) => report.expenseCategoryMonths[category]?.[m.month] ?? 0;
  return toCsv([
    ...headerRows("Profit and Loss Statement", header),
    ["", ...MONTHS, "Total"],
    ["INCOME"],
    row("Gross sales", (m) => m.grossSales),
    row("Refunds and returns", (m) => m.refunds, -1),
    row("Net sales", (m) => m.netSales),
    row("Cost of goods sold (product costs)", (m) => m.cogs, -1),
    row("Gross profit", (m) => m.netSales - m.cogs),
    [],
    ["BUSINESS EXPENSES"],
    row("eBay selling fees", (m) => m.ebayFees),
    row("Other eBay charges (e.g. promoted listings)", (m) => m.otherFees),
    row("Shipping and postage", (m) => m.shipping),
    row("Losses on refunded orders", (m) => m.refundLosses),
    ...report.expenseCategories.map(([category]) => row(category, expenseByMonth(category))),
    row("Total business expenses", (m) => m.ebayFees + m.otherFees + m.shipping + m.refundLosses + m.expenses),
    [],
    row("NET PROFIT", (m) => m.netProfit),
    [],
    ["Orders", ...report.months.map((m) => String(m.orders)), String(report.orderCount)],
    [],
    ["Notes"],
    ["Amounts are by order date. Sales are what buyers paid, not counting sales tax that eBay collects and pays for you."],
    ["Refunded orders are taken out of sales; only what a refund cost you counts as a loss."],
    ["This statement isn't tax advice. Check it with a tax professional before you file."],
  ]);
}

// One line per order, with totals that match the statement.
export function ordersCsv(orders: TaxOrder[], header: Header): string {
  const inYear = orders
    .filter((order) => yearOf(order.orderDate) === header.year)
    .sort((a, b) => String(a.orderDate).localeCompare(String(b.orderDate)));
  const totals = { sale: 0, refund: 0, cogs: 0, ebayFees: 0, otherFees: 0, shipping: 0, refundLoss: 0, net: 0 };
  const rows = inYear.map((order) => {
    const a = orderAmounts(order);
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += a[key];
    const status = order.refunded ? "Refunded" : order.productCost === null ? "Sold - product cost missing" : "Sold";
    return [
      order.orderDate ? order.orderDate.slice(0, 10) : "",
      order.ebayOrderId ?? "",
      order.storeName ?? "",
      order.item ?? "",
      String(order.quantity ?? 1),
      status,
      a.sale,
      a.refund,
      a.cogs,
      a.ebayFees,
      a.otherFees,
      a.shipping,
      a.refundLoss,
      a.net,
    ];
  });
  return toCsv([
    ...headerRows("Orders", header),
    [
      "Date", "eBay order number", "Store", "Item", "Quantity", "Status", "Sale", "Refunded",
      "Product cost", "eBay fees", "Other eBay charges", "Shipping", "Refund loss", "Profit before expenses",
    ],
    ...rows,
    [
      "Total", "", "", `${inYear.length} orders`, "", "",
      cents(totals.sale), cents(totals.refund), cents(totals.cogs), cents(totals.ebayFees), cents(totals.otherFees),
      cents(totals.shipping), cents(totals.refundLoss), cents(totals.net),
    ],
    [],
    ["Profit before expenses doesn't include the business expenses you entered (see the Business Expenses file). Net profit is on the Profit and Loss file."],
  ]);
}

// One line per expense entry (repeating expenses once per month).
export function expensesCsv(expenses: TaxExpense[], header: Header, storeName: (id: string) => string | null): string {
  const inYear = expenses
    .filter((expense) => yearOf(expense.date) === header.year && Number.isFinite(Number(expense.amount)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category));
  const total = cents(inYear.reduce((sum, e) => sum + Number(e.amount), 0));
  return toCsv([
    ...headerRows("Business Expenses", header),
    ["Date", "Category", "Note", "Applies to", "Repeats monthly", "Amount"],
    ...inYear.map((e) => [
      e.date,
      e.category,
      e.note ?? "",
      e.ebayUserId ? storeName(e.ebayUserId) ?? "One store" : "Whole business",
      e.repeatMonthly ? "Yes" : "No",
      Number(e.amount),
    ]),
    ["Total", "", `${inYear.length} entries`, "", "", total],
  ]);
}
