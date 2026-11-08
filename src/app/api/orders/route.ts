import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { existingColumns } from "@/lib/db/optionalColumns";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
import { getUserPlan } from "@/lib/billing/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Columns added by optional SQL files in docs/sql.
const OPTIONAL_COLUMNS = ["shippingLabelCost", "shippingCost", "otherFees"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  const pool = getPool();
  try {
    const optional = await existingColumns(pool, "order", OPTIONAL_COLUMNS);
    const extra = OPTIONAL_COLUMNS.filter((c) => optional.has(c)).map((c) => ` "${c}",`).join("");
    // Only the store the seller is viewing (all orders if none is connected).
    const store = await resolveActiveEbayUserId(pool, user);
    // Free plan: only recent history, and only the month's allowance of
    // orders (the earliest ones each month), even if more were saved earlier.
    const { limits } = await getUserPlan(pool, user.id);
    const limited = limits.monthlyOrders !== null;
    const historyDays = limited ? limits.historyDays : null;
    const perMonth = limits.monthlyOrders;
    const result = await pool.query(`
      WITH ranked AS (
        SELECT o.*,
          row_number() OVER (
            PARTITION BY date_trunc('month', o."orderDate" AT TIME ZONE 'UTC')
            ORDER BY o."orderDate" ASC, o.id ASC
          ) AS "monthRank"
        FROM public."order" o
        WHERE o."userId" = $1
      )
      SELECT id, "ebayOrderId", "ebayUserId", "ebayBuyerId", "userId",
        item, "imageUrl", "salePrice", "ebayFees", "productCost", status,
        "refundAmount", "refundedAt", "refundOutcome", "refundShippingLoss", "refundFeeLoss",
        "ebayItemId", quantity,${extra}
        "orderDate", "createdAt", "updatedAt"
      FROM ranked
      WHERE ($2::text IS NULL OR "ebayUserId" = $2)
        AND ($3::int IS NULL OR "orderDate" >= now() - make_interval(days => $3::int))
        AND ($4::int IS NULL OR "monthRank" <= $4::int)
      ORDER BY "orderDate" DESC, id DESC
    `, [user.id, store, historyDays, perMonth]);
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
  }
}
