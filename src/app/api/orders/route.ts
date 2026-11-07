import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";
import { existingColumns } from "@/lib/db/optionalColumns";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Columns added by optional SQL files in docs/sql.
const OPTIONAL_COLUMNS = ["shippingLabelCost", "shippingCost", "otherFees"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const optional = await existingColumns(pool, "order", OPTIONAL_COLUMNS);
    const extra = OPTIONAL_COLUMNS.filter((c) => optional.has(c)).map((c) => ` "${c}",`).join("");
    // Only the store the seller is viewing (all orders if none is connected).
    const store = await resolveActiveEbayUserId(pool, user);
    const result = await pool.query(`
      SELECT id, "ebayOrderId", "ebayUserId", "ebayBuyerId", "userId",
        item, "imageUrl", "salePrice", "ebayFees", "productCost", status,
        "refundAmount", "refundedAt", "refundOutcome", "refundShippingLoss", "refundFeeLoss",
        "ebayItemId", quantity,${extra}
        "orderDate", "createdAt", "updatedAt"
      FROM public."order"
      WHERE "userId" = $1 AND ($2::text IS NULL OR "ebayUserId" = $2)
      ORDER BY "orderDate" DESC, id DESC
    `, [user.id, store]);
    return NextResponse.json(result.rows, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        // Lets the dashboard know whether shipping costs can be saved yet.
        "X-Shipping-Cost-Enabled": optional.has("shippingCost") ? "1" : "0",
      },
    });
  } catch (e) {
    console.error("Failed to retrieve orders:", e);
    return NextResponse.json({ error: "Failed to retrieve orders." }, { status: 500 });
  } finally { await pool.end(); }
}
