import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const selectOrders = (extraColumns: string) => pool.query(`
      SELECT id, "ebayOrderId", "ebayUserId", "ebayBuyerId", "userId",
        item, "imageUrl", "salePrice", "ebayFees", "productCost", status,
        "refundAmount", "refundedAt", "refundOutcome", "refundShippingLoss", "refundFeeLoss",
        "ebayItemId", quantity,${extraColumns}
        "orderDate", "createdAt", "updatedAt"
      FROM public."order" WHERE "userId" = $1 ORDER BY "orderDate" DESC, id DESC
    `, [user.id]);
    let result;
    try {
      result = await selectOrders(` "shippingLabelCost",`);
    } catch (e) {
      // Optional column not added yet (docs/sql/2026-11-07_shipping_label_cost.sql).
      if ((e as { code?: string }).code !== "42703") throw e;
      result = await selectOrders("");
    }
    return NextResponse.json(result.rows, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (e) {
    console.error("Failed to retrieve orders:", e);
    return NextResponse.json({ error: "Failed to retrieve orders." }, { status: 500 });
  } finally { await pool.end(); }
}
