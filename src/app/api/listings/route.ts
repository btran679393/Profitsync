import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";

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

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const result = await pool.query(
      `
      SELECT "ebayItemId", title, sku, "imageUrl", "listingPrice", quantity, status, "unitCost", "updatedAt"
      FROM public."EbayListing"
      WHERE "userId" = $1 AND environment = 'PRODUCTION'
      ORDER BY status = 'ACTIVE' DESC, "updatedAt" DESC
      `,
      [user.id]
    );
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (e) {
    console.error("Failed to retrieve listings:", e);
    return NextResponse.json({ error: "Failed to retrieve listings." }, { status: 500 });
  } finally {
    await pool.end();
  }
}
