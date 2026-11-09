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

// One response holds at most this many orders. Big accounts are loaded in
// pages (?limit=&offset=), which keeps every response well under Vercel's
// size limit and lets the newest orders show straight away.
const MAX_PAGE = 2000;

// GET ?limit=&offset= : the seller's orders, newest first. Without limit,
// everything (older callers). X-Total-Count says how many there are.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const limitParam = Number(params.get("limit"));
  const offsetParam = Number(params.get("offset"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_PAGE) : null;
  const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

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
    const columns = `id, "ebayOrderId", "ebayUserId", "ebayBuyerId", "userId",
        item, "imageUrl", "salePrice", "ebayFees", "productCost", status,
        "refundAmount", "refundedAt", "refundOutcome", "refundShippingLoss", "refundFeeLoss",
        "ebayItemId", quantity,${extra}
        "orderDate", "createdAt", "updatedAt",
        count(*) OVER () AS "totalRows"`;

    const result = limited
      ? await pool.query(
          `
          WITH ranked AS (
            SELECT o.*,
              row_number() OVER (
                PARTITION BY date_trunc('month', o."orderDate" AT TIME ZONE 'UTC')
                ORDER BY o."orderDate" ASC, o.id ASC
              ) AS "monthRank"
            FROM public."order" o
            WHERE o."userId" = $1
          )
          SELECT ${columns}
          FROM ranked
          WHERE ($2::text IS NULL OR "ebayUserId" = $2)
            AND "orderDate" >= now() - make_interval(days => $3::int)
            AND "monthRank" <= $4::int
          ORDER BY "orderDate" DESC, id DESC
          LIMIT $5 OFFSET $6
          `,
          [user.id, store, limits.historyDays, limits.monthlyOrders, limit, offset]
        )
      : // Paid plans (or billing off): a plain lookup that uses the
        // userId/store/date indexes.
        await pool.query(
          `
          SELECT ${columns}
          FROM public."order"
          WHERE "userId" = $1 AND ($2::text IS NULL OR "ebayUserId" = $2)
          ORDER BY "orderDate" DESC, id DESC
          LIMIT $3 OFFSET $4
          `,
          [user.id, store, limit, offset]
        );

    const total = result.rows.length > 0 ? Number(result.rows[0].totalRows) : offset;
    for (const row of result.rows) delete row.totalRows;
    return NextResponse.json(result.rows, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        // Lets the dashboard know whether shipping costs can be saved yet.
        "X-Shipping-Cost-Enabled": optional.has("shippingCost") ? "1" : "0",
        "X-Total-Count": String(total),
      },
    });
  } catch (e) {
    console.error("Failed to retrieve orders:", e);
    return NextResponse.json({ error: "Failed to retrieve orders." }, { status: 500 });
  }
}
