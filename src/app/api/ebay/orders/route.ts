import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ============================================================
    // STEP 1: Verify the ProfitSync user is signed in.
    // ============================================================

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    // ============================================================
    // STEP 2: Verify database configuration.
    // ============================================================

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error("DATABASE_URL is not configured.");

      return NextResponse.json(
        { error: "Database configuration unavailable." },
        { status: 503 }
      );
    }

    // ============================================================
    // STEP 3: Connect to PostgreSQL.
    // ============================================================

    const pool = getPool();

    try {
      // ============================================================
      // STEP 4: Retrieve orders belonging to this user.
      //
      // Includes:
      // - Original sale information
      // - eBay transaction fees
      // - Product costs
      // - Listing images
      // - Order status
      // - Refund amounts
      // - Refund dates
      // ============================================================

      const result = await pool.query(
        `
        SELECT
          id,
          "ebayOrderId",
          "ebayUserId",
          "userId",
          item,
          "imageUrl",
          "salePrice",
          "ebayFees",
          "productCost",
          status,
          "refundAmount",
          "refundedAt",
          "orderDate",
          "createdAt",
          "updatedAt"
        FROM public."order"
        WHERE "userId" = $1
        ORDER BY "orderDate" DESC, id DESC
        `,
        [user.id]
      );

      // ============================================================
      // STEP 5: Return orders and financial information.
      //
      // Refunded orders are NOT removed from the results.
      //
      // The dashboard uses their refund status to decide:
      // - Whether revenue should count
      // - Whether product costs are required
      // - How to display the order
      // ============================================================

      return NextResponse.json(result.rows, {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    } finally {
      // ============================================================
      // STEP 6: Close the database connection.
      // ============================================================

    }
  } catch (error) {
    console.error("Failed to retrieve eBay orders:", error);

    return NextResponse.json(
      {
        error: "Failed to retrieve eBay orders.",
      },
      { status: 500 }
    );
  }
}