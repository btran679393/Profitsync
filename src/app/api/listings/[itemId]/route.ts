import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { setupNeeded } from "@/lib/setupNeeded";
import { saveListingCost } from "@/lib/listingCost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

// Save a listing's cost per item. With applyToPast, also fill it into this
// listing's past sales that don't have a cost yet (never overwrites one).
export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { itemId } = await params;
  if (!/^\d{1,20}$/.test(itemId)) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Which default to save: cost per item, or shipping per order.
  const field = body.field === "shippingCost" ? "shippingCost" : "unitCost";
  const raw = body[field];
  const clearing = raw === null || raw === "";
  const unitCost = clearing ? null : parseMoney(raw);
  if (!clearing && unitCost === null) {
    return NextResponse.json({ error: "Enter an amount like 8 or 8.50." }, { status: 400 });
  }
  const applyToPast = body.applyToPast === true && unitCost !== null;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await saveListingCost(client, { userId: user.id, itemId, field, value: unitCost, applyToPast });
    if (!saved) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Listing not found. Try refreshing your listings." }, { status: 404 });
    }
    const applied = saved.applied;

    await client.query("COMMIT");
    return NextResponse.json({ success: true, field, value: unitCost, applied });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((e as { code?: string }).code === "42703") {
      return NextResponse.json(
        { error: setupNeeded("Shipping defaults", "docs/sql/2026-11-07_shipping_cost.sql") },
        { status: 409 }
      );
    }
    console.error("Saving listing cost failed:", e);
    return NextResponse.json({ error: "Couldn't save the cost. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
