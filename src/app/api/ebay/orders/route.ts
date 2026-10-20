
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";

export async function GET() {
  try {
    // Verify the user is signed in.
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

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured.");
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
    });

    try {
      // Retrieve only orders owned by this user.
      const result = await pool.query(
        `
        SELECT
          id,
          "ebayOrderId",
          "ebayUserId",
          "userId",
          item,
          "salePrice",
          "ebayFees",
          "productCost",
          status,
          "orderDate",
          "createdAt",
          "updatedAt"
        FROM "order"
        WHERE "userId" = $1
        ORDER BY "orderDate" DESC
        `,
        [user.id]
      );

      return NextResponse.json(result.rows);
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
