import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { existingColumns } from "@/lib/db/optionalColumns";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
import { getUserPlan } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-in user's saved eBay listings (filled by /api/ebay/listings/sync).
// Sales figures per listing are worked out on the dashboard from the orders,
// using the same profit rules as the rest of the dashboard.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  }

  const pool = getPool();
  try {
    // "shippingCost" is added by docs/sql/2026-11-07_shipping_cost.sql.
    // Watchers and 30-day traffic come from docs/sql/2026-11-16_listing_traffic.sql.
    const traffic = ["watchCount", "listedAt", "views30", "impressions30", "sales30", "trafficUpdatedAt"];
    // Views and watchers are part of Pro and Ultimate.
    const { limits } = await getUserPlan(pool, user.id);
    const optional = await existingColumns(pool, "EbayListing", ["shippingCost", ...(limits.buyerInterest ? traffic : [])]);
    const shipping =
      (optional.has("shippingCost") ? `"shippingCost",` : "") +
      traffic.filter((column) => optional.has(column)).map((column) => `"${column}",`).join(" ");
    const store = await resolveActiveEbayUserId(pool, user);
    const result = await pool.query(
      `
      SELECT "ebayItemId", title, sku, "imageUrl", "listingPrice", quantity, status, "unitCost", ${shipping} "createdAt", "updatedAt"
      FROM public."EbayListing"
      WHERE "userId" = $1 AND environment = 'PRODUCTION'
        AND ($2::text IS NULL OR "ebayUserId" = $2)
      ORDER BY status = 'ACTIVE' DESC, "updatedAt" DESC
      `,
      [user.id, store]
    );
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (e) {
    console.error("Failed to retrieve listings:", e);
    return NextResponse.json({ error: "Failed to retrieve listings." }, { status: 500 });
  }
}
