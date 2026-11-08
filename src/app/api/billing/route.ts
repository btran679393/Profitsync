import { NextResponse } from "next/server";
import { Pool } from "pg";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { billingStatus, getStripe, loadSubscription, saveSubscription, stripeConfigured } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: the seller's plan, limits and usage. ?sync=1 first refreshes the
// subscription straight from Stripe (used right after checkout, so the new
// plan shows even if the webhook hasn't arrived yet).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    if (stripeConfigured() && new URL(request.url).searchParams.get("sync") === "1") {
      const { row } = await loadSubscription(pool, user.id);
      if (row?.stripeCustomerId) {
        const list = await getStripe().subscriptions.list({ customer: row.stripeCustomerId, status: "all", limit: 10 });
        const current = pickCurrent(list.data);
        if (current) await saveSubscription(pool, user.id, current);
      }
    }
    return NextResponse.json(await billingStatus(pool, user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Loading billing status failed:", e);
    return NextResponse.json({ error: "Couldn't load your plan." }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// The subscription that matters: a live one if there is one, else the newest.
function pickCurrent(subscriptions: Stripe.Subscription[]) {
  const live = subscriptions.filter((s) => ["active", "trialing", "past_due"].includes(s.status));
  const pool = live.length ? live : subscriptions;
  return [...pool].sort((a, b) => b.created - a.created)[0];
}
