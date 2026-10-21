
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // STEP 1: Verify the ProfitSync user is signed in.
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

    // STEP 2: Verify database configuration.
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error("DATABASE_URL is not configured.");

      return NextResponse.json(
        { error: "Database configuration unavailable." },
        { status: 503 }
      );
    }

    // STEP 3: Connect to the PostgreSQL database.
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      // STEP 4: Retrieve orders belonging to this user.
      // imageUrl contains the actual eBay listing picture.
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
          "orderDate",
          "createdAt",
          "updatedAt"
        FROM public."order"
        WHERE "userId" = $1
        ORDER BY "orderDate" DESC
        `,
        [user.id]
      );

      // STEP 5: Return orders, including listing images.
      return NextResponse.json(result.rows, {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error("Failed to retrieve eBay orders:", error);

    return NextResponse.json(
      { error: "Failed to retrieve eBay orders." },
      { status: 500 }
    );
  }
}
