import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) return null;
  return Math.round(n * 100) / 100;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    body = raw as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const refundMode = "refundOutcome" in body;
  let cost: number | null = null;
  let shipping: number | null = null;
  let fees: number | null = null;
  let outcome: string | null = null;
  if (refundMode) {
    if (!["NOT_SHIPPED", "SHIPPED_LOST", "RETURNED"].includes(String(body.refundOutcome)))
      return NextResponse.json({ error: "Invalid refund outcome." }, { status: 400 });
    outcome = String(body.refundOutcome);
    shipping = parseMoney(body.refundShippingLoss);
    fees = parseMoney(body.refundFeeLoss);
    if (shipping === null || fees === null) return NextResponse.json({ error: "Enter valid shipping and retained fee amounts." }, { status: 400 });
    if (outcome === "SHIPPED_LOST") cost = parseMoney(body.productCost);
    if (outcome === "SHIPPED_LOST" && cost === null) return NextResponse.json({ error: "Enter the lost product cost." }, { status: 400 });
  } else {
    cost = parseMoney(body.productCost);
    if (cost === null) return NextResponse.json({ error: "Invalid product cost." }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const result = refundMode
      ? await pool.query(`
          UPDATE public."order" SET
            "refundOutcome" = $1,
            "refundShippingLoss" = $2::numeric,
            "refundFeeLoss" = $3::numeric,
            "productCost" = CASE WHEN $1 = 'SHIPPED_LOST' THEN $4::numeric ELSE NULL END,
            "updatedAt" = NOW()
          WHERE id = $5 AND "userId" = $6
            AND (status IN ('REFUNDED','PARTIALLY_REFUNDED') OR COALESCE("refundAmount",0) > 0)
          RETURNING id, status, "productCost", "refundOutcome", "refundShippingLoss", "refundFeeLoss"
        `, [outcome, shipping, fees, cost, orderId, user.id])
      : await pool.query(`
          UPDATE public."order" SET "productCost" = $1::numeric, status = 'COMPLETED', "updatedAt" = NOW()
          WHERE id = $2 AND "userId" = $3
            AND status NOT IN ('REFUNDED','PARTIALLY_REFUNDED')
            AND COALESCE("refundAmount",0) = 0
          RETURNING id, status, "productCost"
        `, [cost, orderId, user.id]);
    if (result.rowCount) return NextResponse.json(result.rows[0]);
    const existing = await pool.query(`SELECT id FROM public."order" WHERE id = $1 AND "userId" = $2`, [orderId, user.id]);
    return NextResponse.json({ error: existing.rowCount ? "Order refund state does not allow this update." : "Order not found." }, { status: existing.rowCount ? 409 : 404 });
  } catch (e) {
    console.error("Order update failed:", e);
    return NextResponse.json({ error: "Failed to update order. Verify the refund-loss database migration ran." }, { status: 500 });
  } finally { await pool.end(); }
}
