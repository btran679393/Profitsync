import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { getStripe, loadSubscription, siteOrigin, stripeConfigured } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: a link to Stripe's billing page, where the seller can update their
// card, download invoices or cancel. → { url }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn't set up yet." }, { status: 503 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const { row } = await loadSubscription(pool, user.id);
    if (!row?.stripeCustomerId) {
      return NextResponse.json({ error: "You don't have a paid plan to manage yet." }, { status: 404 });
    }
    const session = await getStripe().billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${siteOrigin(request)}/?billing=portal#billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Opening billing portal failed:", e);
    return NextResponse.json({ error: "Couldn't open the billing page. Please try again." }, { status: 500 });
  } finally {
    await pool.end();
  }
}
