import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/db/optionalColumns";
import { getUserPlan } from "@/lib/billing/server";
import { setupNeeded } from "@/lib/setupNeeded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

// Fill in shipping costs from a spreadsheet (e.g. a Pirate Ship export).
// Body: { items: [{ ebayOrderId, cost }], overwrite?: boolean }.
// Without overwrite, orders that already have a shipping cost are left alone.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: { items?: unknown; overwrite?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const ids: string[] = [];
  const costs: string[] = [];
  for (const raw of items.slice(0, MAX_ROWS)) {
    const item = raw as { ebayOrderId?: unknown; cost?: unknown };
    const id = typeof item.ebayOrderId === "string" ? item.ebayOrderId.trim() : "";
    const cost = Number(item.cost);
    if (!/^[\w-]{5,40}$/.test(id) || !Number.isFinite(cost) || cost < 0 || cost > 100000) continue;
    ids.push(id);
    costs.push((Math.round(cost * 100) / 100).toFixed(2));
  }
  if (ids.length === 0) return NextResponse.json({ error: "No usable rows to import." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    if (!(await getUserPlan(pool, user.id)).limits.exports) {
      return NextResponse.json(
        { error: "Importing shipping costs is part of the Pro and Ultimate plans.", upgrade: true },
        { status: 402 }
      );
    }
    const result = await pool.query(
      `
      UPDATE public."order" o
      SET "shippingCost" = v.cost, "updatedAt" = NOW()
      FROM unnest($1::text[], $2::numeric[]) AS v(order_id, cost)
      WHERE o."userId" = $3
        AND o."ebayOrderId" = v.order_id
        AND ($4::boolean OR o."shippingCost" IS NULL)
        AND o."shippingCost" IS DISTINCT FROM v.cost
      `,
      [ids, costs, user.id, body.overwrite === true]
    );
    return NextResponse.json({ success: true, updated: result.rowCount ?? 0 });
  } catch (e) {
    if (isMissingColumn(e)) {
      return NextResponse.json(
        { error: setupNeeded("Shipping costs", "docs/sql/2026-11-07_shipping_cost.sql") },
        { status: 409 }
      );
    }
    console.error("Shipping import failed:", e);
    return NextResponse.json({ error: "Couldn't import shipping costs." }, { status: 500 });
  } finally {
    await pool.end();
  }
}
