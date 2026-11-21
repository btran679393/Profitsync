import { getOrderProfit, getRefundLoss, hasRecordedCost, isCanceled, isFullyRefunded, type Order } from "@/app/dashboard/model";

// The numbers in the weekly email, worked out the same way as the Dashboard.

export type WeeklySummary = {
  profit: number; // last 7 days, orders with a cost, minus refund losses
  previousProfit: number; // the 7 days before
  revenue: number;
  sales: number; // units sold
  orders: number;
  best: { item: string; profit: number } | null;
  losing: number; // orders that lost money this week
  refunds: { count: number; amount: number };
  weekNeedsCost: number; // this week's orders still without a cost
};

const DAY = 24 * 60 * 60 * 1000;

export function weeklySummary(orders: Order[], now: Date): WeeklySummary {
  const weekStart = now.getTime() - 7 * DAY;
  const previousStart = now.getTime() - 14 * DAY;
  const time = (o: Order) => (o.orderDate ? new Date(o.orderDate).getTime() : NaN);
  const inRange = (o: Order, from: number, to: number) => time(o) >= from && time(o) < to;

  const week = orders.filter((o) => inRange(o, weekStart, now.getTime() + 1) && !isCanceled(o));
  const previous = orders.filter((o) => inRange(o, previousStart, weekStart) && !isCanceled(o));

  const profitOf = (list: Order[]) =>
    list.reduce((sum, o) => sum + (getOrderProfit(o) ?? 0), 0) - list.reduce((sum, o) => sum + getRefundLoss(o), 0);

  const active = week.filter((o) => !isFullyRefunded(o));
  const byItem = new Map<string, number>();
  for (const o of active) {
    const p = getOrderProfit(o);
    if (p !== null) byItem.set(o.item, (byItem.get(o.item) ?? 0) + p);
  }
  const bestEntry = [...byItem].sort((a, b) => b[1] - a[1])[0];

  const refunded = week.filter((o) => o.refundAmount > 0 || isFullyRefunded(o));

  return {
    profit: round(profitOf(week)),
    previousProfit: round(profitOf(previous)),
    revenue: round(active.reduce((sum, o) => sum + Math.max(0, o.salePrice - o.refundAmount), 0)),
    sales: active.reduce((sum, o) => sum + o.quantity, 0),
    orders: active.length,
    best: bestEntry && bestEntry[1] > 0 ? { item: bestEntry[0], profit: round(bestEntry[1]) } : null,
    losing: active.filter((o) => (getOrderProfit(o) ?? 0) < 0).length,
    refunds: { count: refunded.length, amount: round(refunded.reduce((sum, o) => sum + (isFullyRefunded(o) ? o.salePrice : o.refundAmount), 0)) },
    weekNeedsCost: active.filter((o) => !hasRecordedCost(o)).length,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// The email itself.

export type WeeklyEmailExtras = {
  firstName: string | null;
  needsCost: number; // all recent orders still without a cost
  reconnect: Array<{ store: string; daysLeft: number }>; // eBay sign-ins expiring soon (0 = expired)
  appUrl: string;
  unsubscribeUrl: string;
};

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const signedMoney = (n: number) => (n < 0 ? `−${money(Math.abs(n))}` : money(n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function changeText(now: number, before: number): string | null {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return "same as the week before";
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on the week before`;
}

// Whether there's anything worth emailing about.
export function worthSending(s: WeeklySummary, extras: Pick<WeeklyEmailExtras, "needsCost" | "reconnect">): boolean {
  return s.orders > 0 || s.refunds.count > 0 || extras.needsCost > 0 || extras.reconnect.length > 0;
}

export function renderWeeklyEmail(s: WeeklySummary, extras: WeeklyEmailExtras): { subject: string; html: string; text: string } {
  const change = changeText(s.profit, s.previousProfit);
  const subject =
    s.orders > 0
      ? `Your week: ${signedMoney(s.profit)} profit from ${plural(s.orders, "order")}`
      : extras.reconnect.length > 0
        ? "Action needed: reconnect your eBay store"
        : "Your ProfitSync week";

  const todo: string[] = [];
  for (const r of extras.reconnect) {
    todo.push(
      r.daysLeft <= 0
        ? `Your eBay sign-in for ${r.store} has run out. Reconnect it so your orders keep coming in.`
        : `Your eBay sign-in for ${r.store} runs out in ${plural(r.daysLeft, "day")}. Reconnect it to keep syncing.`
    );
  }
  if (extras.needsCost > 0) todo.push(`${plural(extras.needsCost, "order needs", "orders need")} a product cost, so your profit is incomplete.`);
  if (s.losing > 0) todo.push(`${plural(s.losing, "order")} lost money this week. Worth a look at the price or shipping.`);
  if (s.refunds.count > 0) todo.push(`${plural(s.refunds.count, "refund")} this week (${money(s.refunds.amount)}).`);

  const hello = extras.firstName ? `Hi ${extras.firstName},` : "Hi,";
  const lines: string[] = [hello, ""];
  if (s.orders > 0) {
    lines.push(`Profit in the last 7 days: ${signedMoney(s.profit)}${change ? ` (${change})` : ""}.`);
    lines.push(`${plural(s.sales, "item")} sold for ${money(s.revenue)}.`);
    if (s.best) lines.push(`Best seller: ${s.best.item} (${money(s.best.profit)} profit).`);
  } else {
    lines.push("No sales in the last 7 days.");
  }
  if (todo.length) {
    lines.push("", "To do:");
    for (const t of todo) lines.push(`- ${t}`);
  }
  lines.push("", `Open ProfitSync: ${extras.appUrl}`, "", `Stop these weekly emails: ${extras.unsubscribeUrl}`);
  const text = lines.join("\n");

  const e = escapeHtml;
  const stat = (label: string, value: string, color = "#0f172a") =>
    `<td style="padding:12px 16px;background:#f1f5f9;border-radius:10px;"><div style="font-size:12px;color:#64748b;">${e(label)}</div><div style="font-size:20px;font-weight:700;color:${color};margin-top:2px;">${e(value)}</div></td>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
<tr><td>
<div style="font-weight:800;font-size:18px;color:#4f46e5;">ProfitSync</div>
<p style="font-size:15px;margin:20px 0 4px;">${e(hello)}</p>
${
  s.orders > 0
    ? `<p style="font-size:15px;margin:0 0 16px;">Here's your last 7 days${change ? `, ${e(change)}` : ""}.</p>
<table role="presentation" cellpadding="0" cellspacing="8" style="margin:0 -8px;"><tr>
${stat("Profit", signedMoney(s.profit), s.profit < 0 ? "#dc2626" : "#16a34a")}
${stat("Sales", money(s.revenue))}
${stat("Items sold", String(s.sales))}
</tr></table>
${s.best ? `<p style="font-size:14px;margin:16px 0 0;color:#334155;">Best seller: <strong>${e(s.best.item)}</strong> (${e(money(s.best.profit))} profit)</p>` : ""}`
    : `<p style="font-size:15px;margin:0 0 16px;">No sales in the last 7 days.</p>`
}
${
  todo.length
    ? `<div style="margin-top:22px;padding:16px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;">
<div style="font-weight:700;font-size:14px;margin-bottom:6px;">To do</div>
${todo.map((t) => `<div style="font-size:14px;color:#334155;margin:6px 0;">• ${e(t)}</div>`).join("")}
</div>`
    : ""
}
<p style="margin:24px 0 0;"><a href="${e(extras.appUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">Open ProfitSync</a></p>
</td></tr></table>
<p style="font-size:12px;color:#94a3b8;margin:16px 0 0;max-width:560px;">You get this weekly summary because you have a ProfitSync account. <a href="${e(extras.unsubscribeUrl)}" style="color:#64748b;">Stop these emails</a> or change it in Settings.</p>
</td></tr></table></body></html>`;

  return { subject, html, text };
}
