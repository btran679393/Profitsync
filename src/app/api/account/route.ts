import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { getStripe, loadSubscription, stripeConfigured } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTable(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}

// DELETE { confirm: "DELETE" }: permanently delete the signed-in ProfitSync
// account: a paid plan is cancelled, then every order, listing, expense,
// eBay connection and the sign-in itself are removed. Nothing changes on eBay.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let confirm: unknown;
  try {
    confirm = ((await request.json()) as { confirm?: unknown }).confirm;
  } catch {
    confirm = null;
  }
  if (confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = getPool();
  try {
    // 1. Stop any paid plan so they're never charged again.
    if (stripeConfigured()) {
      const { row } = await loadSubscription(pool, user.id);
      if (row?.stripeSubscriptionId && !row.comped && row.status !== "canceled") {
        try {
          await getStripe().subscriptions.cancel(row.stripeSubscriptionId);
        } catch (e) {
          if ((e as { code?: string }).code !== "resource_missing") throw e;
        }
      }
    }

    // 2. Delete their data and the account, all or nothing.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["order", "EbayListing", "ebayConnection", "expense", "subscription"]) {
        await client.query("SAVEPOINT t");
        try {
          await client.query(`DELETE FROM public."${table}" WHERE "userId" = $1`, [user.id]);
          await client.query("RELEASE SAVEPOINT t");
        } catch (e) {
          // A table that was never created (optional SQL not run) is fine.
          if (!isMissingTable(e)) throw e;
          await client.query("ROLLBACK TO SAVEPOINT t");
        }
      }
      await client.query(`DELETE FROM auth.users WHERE id = $1`, [user.id]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }

    // 3. Clear this browser's sign-in cookies.
    await supabase.auth.signOut().catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Deleting account failed:", e);
    return NextResponse.json(
      { error: "Couldn't delete your account. Please try again, or contact support." },
      { status: 500 }
    );
  }
}
