import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let pool: Pool | null = null;

  try {
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
      console.error("DATABASE_URL is not configured.");
      return NextResponse.json(
        { error: "Database configuration unavailable." },
        { status: 503 }
      );
    }

    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });

    const result = await pool.query(
      `
      SELECT
        id,
        "ebayOrderId",
        "ebayUserId",
        "ebayBuyerId",
        "userId",
        item,
        "imageUrl",
        "salePrice",
        "ebayFees",
        "productCost",
        "refundAmount",
        "refundedAt",
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

    return NextResponse.json(result.rows, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Failed to retrieve ProfitSync orders:", error);
    return NextResponse.json(
      { error: "Failed to retrieve eBay orders." },
      { status: 500 }
    );
  } finally {
    if (pool) await pool.end();
  }
}
