import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { setupNeeded } from "@/lib/setupNeeded";
import { getUserPlan, startTrial, stripeConfigured, trialEligible } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: start the free Pro trial. No card and no Stripe involved; the server
// decides who can have it (once per account, only on Free, never after paying).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await rateLimit("billing", user.id);
  if (limited) return limited;
  if (!stripeConfigured()) return NextResponse.json({ error: "Every feature is already open for now." }, { status: 409 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = getPool();
  try {
    const current = await getUserPlan(pool, user.id);
    if (!current.enabled) {
      return NextResponse.json({ error: setupNeeded("Paid plans", "docs/sql/2026-11-08_billing.sql") }, { status: 409 });
    }
    if (!trialEligible(current.row, current.plan)) {
      return NextResponse.json({ error: "The free trial has already been used on this account." }, { status: 409 });
    }
    const endsAt = await startTrial(pool, user.id);
    if (!endsAt) {
      return NextResponse.json({ error: "The free trial has already been used on this account." }, { status: 409 });
    }
    return NextResponse.json({ endsAt: new Date(endsAt).toISOString() });
  } catch (e) {
    if ((e as { code?: string }).code === "42703") {
      return NextResponse.json({ error: setupNeeded("The free trial", "docs/sql/2026-11-21_trial.sql") }, { status: 409 });
    }
    console.error("Starting the trial failed:", e);
    return NextResponse.json({ error: "Couldn't start the trial. Please try again." }, { status: 500 });
  }
}
