import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
import { ebayBases, fetchTransactions, moneyCents, storeAccessToken, transactionOrderId } from "@/lib/ebay/finances";
import { monthRange, reconcileMonth, type AppOrder, type EbaySale } from "@/lib/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET ?month=YYYY-MM : compare that month's ProfitSync orders for the store
// being viewed with eBay's own payment records. Read-only on both sides.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const month = new URL(request.url).searchParams.get("month") ?? "";
  const range = monthRange(month);
  if (!range) return NextResponse.json({ error: "Choose a month." }, { status: 400 });

  const pool = getPool();
  try {
    const store = await resolveActiveEbayUserId(pool, user);
    if (!store) {
      return NextResponse.json({ error: "Pick one store in the store menu first, then run the check." }, { status: 400 });
    }

    const token = await storeAccessToken(pool, user.id, store);
    if ("reconnect" in token) {
      return NextResponse.json(
        { error: "eBay needs you to sign in again.", message: "Please reconnect your eBay account.", reconnect: true },
        { status: 401 }
      );
    }
    if ("error" in token) return NextResponse.json({ error: token.error }, { status: 400 });

    // A few days either side, so orders paid across a month boundary
    // aren't reported as missing.
    const now = Date.now();
    const DAY = 86_400_000;
    const wideFrom = new Date(range.from.getTime() - 5 * DAY);
    const wideTo = new Date(Math.min(range.to.getTime() + 5 * DAY, now));
    const monthTo = new Date(Math.min(range.to.getTime(), now));
    const { finances } = ebayBases();

    const [sales, refunds] = await Promise.all([
      fetchTransactions(finances, token.token, "SALE", wideFrom, wideTo),
      fetchTransactions(finances, token.token, "REFUND", range.from, monthTo),
    ]);

    const ebaySales = new Map<string, EbaySale>();
    const ebaySeen = new Set<string>();
    for (const t of sales) {
      const orderId = transactionOrderId(t);
      if (!orderId) continue;
      ebaySeen.add(orderId);
      const when = t.transactionDate ? new Date(t.transactionDate).getTime() : NaN;
      if (!(when >= range.from.getTime() && when < range.to.getTime())) continue;
      const sign = t.bookingEntry === "DEBIT" ? -1 : 1;
      const amount = (moneyCents(t.amount) ?? 0) * sign;
      const fee = moneyCents(t.totalFeeAmount) ?? 0;
      const entry = ebaySales.get(orderId) ?? { saleCents: 0, feeCents: 0 };
      entry.saleCents += amount + fee;
      entry.feeCents += fee;
      ebaySales.set(orderId, entry);
    }

    const ebayRefunds = new Map<string, number>();
    for (const t of refunds) {
      const orderId = transactionOrderId(t);
      if (!orderId) continue;
      const cents = Math.abs(moneyCents(t.amount) ?? 0);
      const signed = t.bookingEntry === "CREDIT" ? -cents : cents; // a reversed refund
      ebayRefunds.set(orderId, (ebayRefunds.get(orderId) ?? 0) + signed);
    }
    for (const [orderId, cents] of ebayRefunds) if (cents <= 0) ebayRefunds.delete(orderId);

    const mentioned = [...new Set([...ebaySales.keys(), ...ebayRefunds.keys()])];
    const { rows } = await pool.query<{
      ebayOrderId: string;
      item: string;
      salePrice: string;
      ebayFees: string;
      refundAmount: string | null;
      inMonth: boolean;
    }>(
      `SELECT "ebayOrderId", item, "salePrice", "ebayFees", "refundAmount",
              ("orderDate" >= $3 AND "orderDate" < $4) AS "inMonth"
       FROM public."order"
       WHERE "userId" = $1 AND "ebayUserId" = $2 AND "ebayOrderId" IS NOT NULL
         AND (("orderDate" >= $3 AND "orderDate" < $4) OR "ebayOrderId" = ANY($5::text[]))`,
      [user.id, store, range.from.toISOString(), range.to.toISOString(), mentioned]
    );
    const app: AppOrder[] = rows.map((r) => ({
      orderId: r.ebayOrderId,
      item: r.item,
      saleCents: Math.round(Number(r.salePrice) * 100),
      feeCents: Math.round(Number(r.ebayFees) * 100),
      refundCents: Math.round(Number(r.refundAmount ?? 0) * 100),
      inMonth: Boolean(r.inMonth),
    }));

    const result = reconcileMonth(ebaySales, ebayRefunds, ebaySeen, app);
    return NextResponse.json({ month, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Check against eBay failed:", e);
    return NextResponse.json(
      { error: e instanceof Error && e.message.startsWith("eBay") ? e.message : "Couldn't compare with eBay right now. Please try again." },
      { status: 502 }
    );
  }
}
