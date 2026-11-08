import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { Pool } from "pg";
import type Stripe from "stripe";
import { getStripe, loadSubscription, saveSubscription } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe tells ProfitSync about payments and plan changes here. Every event
// is checked against STRIPE_WEBHOOK_SECRET, so nobody else can fake one.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Billing webhook isn't configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const pool = getPool();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (userId && subscriptionId) {
          await saveSubscription(pool, userId, await stripe.subscriptions.retrieve(subscriptionId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object;
        const userId = await userForSubscription(pool, subscription);
        if (userId) {
          // Re-read it so events arriving out of order can't save stale data.
          const fresh = event.type === "customer.subscription.deleted"
            ? subscription
            : await stripe.subscriptions.retrieve(subscription.id);
          // An old, ended subscription must not replace a newer live one.
          const { row } = await loadSubscription(pool, userId);
          const live = ["active", "trialing", "past_due"].includes(fresh.status);
          if (live || !row?.stripeSubscriptionId || row.stripeSubscriptionId === fresh.id) {
            await saveSubscription(pool, userId, fresh);
          }
        } else {
          console.warn("Stripe subscription with no ProfitSync account:", subscription.id);
        }
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Handling Stripe event failed:", event.type, e);
    // 500 makes Stripe retry later.
    return NextResponse.json({ error: "Couldn't process the event." }, { status: 500 });
  }
}

async function userForSubscription(pool: Pool, subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.profitsyncUserId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const result = await pool.query<{ userId: string }>(
    `SELECT "userId" FROM public."subscription" WHERE "stripeCustomerId" = $1 LIMIT 1`,
    [customerId]
  );
  return result.rows[0]?.userId ?? null;
}
