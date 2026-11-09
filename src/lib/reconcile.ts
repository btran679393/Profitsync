// "Check against eBay": compare one month of ProfitSync orders with eBay's
// own payment records. Pure functions (no network), so they're tested.
//
// From eBay's SALE records, a sale's amount before fees is
// payout (amount) + fees (totalFeeAmount). eBay keeps sales tax out of
// both, which matches how ProfitSync stores the sale price.

export type EbaySale = { saleCents: number; feeCents: number };
export type AppOrder = { orderId: string; item: string; saleCents: number; feeCents: number; refundCents: number; inMonth: boolean };

export type IssueKind = "missing_in_profitsync" | "missing_on_ebay" | "fees_differ" | "sale_differs" | "refund_missing";
export type Issue = {
  orderId: string;
  item: string | null;
  kind: IssueKind;
  ebayCents: number | null;
  profitsyncCents: number | null;
};

export type ReconcileResult = {
  ebay: { orders: number; salesCents: number; feesCents: number; refundsCents: number };
  profitsync: { orders: number; salesCents: number; feesCents: number; refundsCents: number };
  matched: number;
  issues: Issue[];
};

// A cent or two of rounding isn't worth flagging.
const TOLERANCE_CENTS = 2;

/**
 * @param ebaySales   eBay sale records in the month, per order
 * @param ebayRefunds eBay refunds recorded in the month, per order (may be for older sales)
 * @param ebaySeen    every order eBay has a sale record for in a slightly wider window, so an
 *                    order placed on the 31st and paid on the 1st isn't called missing
 * @param app         ProfitSync orders placed in the month, plus any order eBay mentions
 */
export function reconcileMonth(
  ebaySales: Map<string, EbaySale>,
  ebayRefunds: Map<string, number>,
  ebaySeen: Set<string>,
  app: AppOrder[]
): ReconcileResult {
  const appById = new Map(app.map((o) => [o.orderId, o]));
  const issues: Issue[] = [];
  const flagged = new Set<string>();
  const flag = (issue: Issue) => {
    issues.push(issue);
    flagged.add(issue.orderId);
  };

  const ebayTotals = { orders: ebaySales.size, salesCents: 0, feesCents: 0, refundsCents: 0 };
  for (const [orderId, sale] of ebaySales) {
    ebayTotals.salesCents += sale.saleCents;
    ebayTotals.feesCents += sale.feeCents;
    const mine = appById.get(orderId);
    if (!mine) {
      flag({ orderId, item: null, kind: "missing_in_profitsync", ebayCents: sale.saleCents, profitsyncCents: null });
      continue;
    }
    if (Math.abs(mine.saleCents - sale.saleCents) > TOLERANCE_CENTS) {
      flag({ orderId, item: mine.item, kind: "sale_differs", ebayCents: sale.saleCents, profitsyncCents: mine.saleCents });
    }
    if (Math.abs(mine.feeCents - sale.feeCents) > TOLERANCE_CENTS) {
      flag({ orderId, item: mine.item, kind: "fees_differ", ebayCents: sale.feeCents, profitsyncCents: mine.feeCents });
    }
  }

  for (const [orderId, refundCents] of ebayRefunds) {
    ebayTotals.refundsCents += refundCents;
    const mine = appById.get(orderId);
    if (!mine) {
      if (!flagged.has(orderId)) {
        flag({ orderId, item: null, kind: "missing_in_profitsync", ebayCents: refundCents, profitsyncCents: null });
      }
    } else if (mine.refundCents === 0) {
      flag({ orderId, item: mine.item, kind: "refund_missing", ebayCents: refundCents, profitsyncCents: 0 });
    }
  }

  const appTotals = { orders: 0, salesCents: 0, feesCents: 0, refundsCents: 0 };
  for (const mine of app) {
    if (!mine.inMonth) continue;
    appTotals.orders++;
    appTotals.salesCents += mine.saleCents;
    appTotals.feesCents += mine.feeCents;
    if (!ebaySales.has(mine.orderId) && !ebaySeen.has(mine.orderId)) {
      flag({ orderId: mine.orderId, item: mine.item, kind: "missing_on_ebay", ebayCents: null, profitsyncCents: mine.saleCents });
    }
  }
  // Refunds ProfitSync has for the orders eBay refunded this month.
  for (const orderId of ebayRefunds.keys()) appTotals.refundsCents += appById.get(orderId)?.refundCents ?? 0;

  const matched = [...ebaySales.keys()].filter((id) => !flagged.has(id)).length;
  return { ebay: ebayTotals, profitsync: appTotals, matched, issues };
}

// "2026-10" → the month's first moment and the next month's first moment (UTC).
export function monthRange(month: string): { from: Date; to: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return null;
  return { from: new Date(Date.UTC(year, index, 1)), to: new Date(Date.UTC(year, index + 1, 1)) };
}
