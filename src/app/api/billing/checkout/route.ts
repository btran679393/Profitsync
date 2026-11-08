import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { isBillingInterval, isPaidPlan } from "@/lib/billing/plans";
import { setupNeeded } from "@/lib/setupNeeded";
import {
  ensureCustomer,
  ensurePrice,
  getStripe,
  getUserPlan,
  planFromPrice,
  saveSubscription,
  siteOrigin,
  stripeConfigured,
} from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { plan, interval }:
// - no paid plan yet → returns { url } of a Stripe Checkout page to pay
// - already paying   → switches the subscription to the new plan/period
//   straight away (Stripe charges or credits the difference) → { changed: true }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn't set up yet." }, { status: 503 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  let body: { plan?: unknown; interval?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isPaidPlan(body.plan) || !isBillingInterval(body.interval)) {
    return NextResponse.json({ error: "Choose Pro or Ultimate, monthly or yearly." }, { status: 400 });
  }
  const plan = body.plan;
  const interval = body.interval;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const current = await getUserPlan(pool, user.id);
    if (!current.enabled) {
      return NextResponse.json(
        { error: setupNeeded("Paid plans", "docs/sql/2026-11-08_billing.sql") },
        { status: 409 }
      );
    }
    if (current.row?.comped) {
      return NextResponse.json({ error: "Your account already has ProfitSync for free." }, { status: 409 });
    }

    const stripe = getStripe();
    const priceId = await ensurePrice(plan, interval);

    // Already subscribed: change the existing subscription instead of
    // starting a second one.
    const subscriptionId = current.row?.stripeSubscriptionId;
    if (current.plan !== "free" && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const item = subscription.items.data[0];
      const now = planFromPrice(item?.price);
      if (now && now.plan === plan && now.interval === interval && !subscription.cancel_at_period_end) {
        return NextResponse.json({ error: "You're already on this plan." }, { status: 409 });
      }
      const updated = await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "always_invoice",
        cancel_at_period_end: false,
        metadata: { profitsyncUserId: user.id },
      });
      await saveSubscription(pool, user.id, updated);
      return NextResponse.json({ changed: true });
    }

    const customerId = await ensureCustomer(pool, user, current.row);
    const origin = siteOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { profitsyncUserId: user.id } },
      success_url: `${origin}/?billing=success#billing`,
      cancel_url: `${origin}/?billing=cancelled#billing`,
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout link.");
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Starting checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 500 });
  } finally {
    await pool.end();
  }
}
