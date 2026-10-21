
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let pool: Pool | null = null;

  try {
    // STEP 1: Authenticate the ProfitSync user.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Authentication required.",
        },
        {
          status: 401,
        }
      );
    }

    // STEP 2: Verify database configuration.
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error("DATABASE_URL is not configured.");

      return NextResponse.json(
        {
          error: "Database configuration unavailable.",
        },
        {
          status: 503,
        }
      );
    }

    // STEP 3: Connect to PostgreSQL.
    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });

    // STEP 4: Retrieve this user's orders.
    // Include the actual eBay listing image URL.
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
      ORDER BY "orderDate" DESC, id DESC
      `,
      [user.id]
    );

    // STEP 5: Return orders and listing images.
    return NextResponse.json(result.rows, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error(
      "Failed to retrieve ProfitSync orders:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to retrieve eBay orders.",
      },
      {
        status: 500,
      }
    );
  } finally {
    // STEP 6: Close the database connection.
    if (pool) {
      await pool.end();
    }
  }
}
