// Full or partial refund?
//
// eBay's payment records often give a full refund as the sale minus the
// fees eBay handed back, so a refund that covers the sale after eBay's fees
// is a full refund: the sale is taken out and only what the refund cost
// you counts. Anything smaller is a partial refund: the sale stays, the
// refunded amount comes off it, and the order still needs its product cost.

const CENT = 0.01;

export type RefundFacts = {
  status: string | null | undefined;
  salePrice: number;
  ebayFees: number;
  refundAmount: number;
};

export function refundIsFull({ status, salePrice, ebayFees, refundAmount }: RefundFacts): boolean {
  if (status === "REFUNDED") return true;
  const refund = Number(refundAmount) || 0;
  // Marked refunded by eBay but without an amount: treat it as full, as before.
  if (refund <= 0) return status === "PARTIALLY_REFUNDED";
  return refund >= salePrice - Math.max(0, ebayFees || 0) - CENT;
}

export function refundIsPartial(order: RefundFacts): boolean {
  return (Number(order.refundAmount) || 0) > 0 && !refundIsFull(order);
}

// The same rule in SQL, for an order table alias like `o.` (or "" for none).
export function fullyRefundedSql(prefix = ""): string {
  const p = prefix;
  return `(
    ${p}status = 'REFUNDED'
    OR (${p}status = 'PARTIALLY_REFUNDED' AND COALESCE(${p}"refundAmount", 0) <= 0)
    OR (COALESCE(${p}"refundAmount", 0) > 0
        AND ${p}"refundAmount" >= ${p}"salePrice" - GREATEST(COALESCE(${p}"ebayFees", 0), 0) - ${CENT})
  )`;
}

// The status an order gets once it has a product cost.
export function statusWithCostSql(prefix = ""): string {
  return `CASE WHEN COALESCE(${prefix}"refundAmount", 0) > 0 THEN 'PARTIALLY_REFUNDED' ELSE 'COMPLETED' END`;
}
