// Sample payouts for the public demo, worked out from the demo orders:
// eBay pays out once a week (Mondays), the newest payout is still on its
// way, and the last few days of sales are still waiting at eBay.

import type { ApiOrder } from "@/app/dashboard/model";
import { breakdown, type FundsSummary, type Payout, type PayoutLine, type PayoutsResponse } from "@/lib/ebay/payouts";
import { DEMO_STORE_ID, DEMO_STORE_NAME } from "./data";

const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;

function lastMonday(now: Date) {
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// What one order adds to a payout: sale after fees and ad fees, then the
// label and any refund taken off.
function orderLines(o: ApiOrder): PayoutLine[] {
  const id = String(o.ebayOrderId ?? o.id);
  const date = String(o.orderDate);
  const fees = round(Number(o.ebayFees ?? 0) + Number(o.otherFees ?? 0));
  const lines: PayoutLine[] = [
    { id: `${id}-sale`, kind: "sale", type: "SALE", date, orderId: id, net: round(Number(o.salePrice) - fees), fees, memo: null },
  ];
  const label = Number(o.shippingLabelCost ?? 0);
  if (label > 0) lines.push({ id: `${id}-label`, kind: "label", type: "SHIPPING_LABEL", date, orderId: id, net: -label, fees: 0, memo: null });
  const refund = Number(o.refundAmount ?? 0);
  if (refund > 0) {
    lines.push({ id: `${id}-refund`, kind: "refund", type: "REFUND", date: String(o.refundedAt ?? date), orderId: id, net: -refund, fees: 0, memo: null });
  }
  return lines;
}

export function demoPayouts(orders: ApiOrder[], days: number, now = new Date()) {
  const monday = lastMonday(now);
  const payouts: Payout[] = [];
  const details = new Map<string, PayoutLine[]>();
  for (let week = 0; week < 14; week++) {
    const payDay = new Date(monday.getTime() - week * 7 * DAY);
    // Sales from the week that ended two days before payday.
    const end = payDay.getTime() - 2 * DAY;
    const start = end - 7 * DAY;
    const inWeek = orders.filter((o) => {
      const t = Date.parse(String(o.orderDate));
      return t >= start && t < end;
    });
    if (inWeek.length === 0) continue;
    const lines = inWeek.flatMap(orderLines).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const amount = breakdown(lines).net;
    if (amount <= 0) continue;
    const id = `DEMO-${payDay.toISOString().slice(0, 10)}`;
    details.set(id, lines);
    payouts.push({
      id,
      storeId: DEMO_STORE_ID,
      storeName: DEMO_STORE_NAME,
      status: week === 0 && now.getTime() - payDay.getTime() < 3 * DAY ? "INITIATED" : "SUCCEEDED",
      amount,
      date: payDay.toISOString(),
      bankName: "Checking",
      bankLast4: "4821",
      transactionCount: lines.length,
    });
  }

  // Sales since the last payout cut-off are still at eBay.
  const cutoff = monday.getTime() - 2 * DAY;
  const waiting = orders.filter((o) => Date.parse(String(o.orderDate)) >= cutoff);
  const net = (list: ApiOrder[]) => round(breakdown(list.flatMap(orderLines)).net);
  const recent = waiting.filter((o) => Date.parse(String(o.orderDate)) >= now.getTime() - 2 * DAY);
  const ready = waiting.filter((o) => !recent.includes(o));
  const funds: FundsSummary = { available: net(ready), processing: net(recent), onHold: 0, total: round(net(ready) + net(recent)) };

  const from = new Date(now.getTime() - days * DAY);
  const response: PayoutsResponse = {
    funds,
    payouts: payouts.filter((p) => p.date && Date.parse(p.date) >= from.getTime()),
    reconnect: [],
    from: from.toISOString(),
    to: now.toISOString(),
  };
  return { response, details };
}
