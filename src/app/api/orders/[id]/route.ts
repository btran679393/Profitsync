import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ============================================================
    // STEP 1: Authenticate the signed-in ProfitSync user.
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
    // STEP 2: Validate the order ID.
    // ============================================================

    const { id } = await params;
    const orderId = Number(id);

    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return NextResponse.json(
        { error: "Invalid order ID." },
        { status: 400 }
      );
    }

    // ============================================================
    // STEP 3: Validate the product cost.
    // ============================================================

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("productCost" in body)
    ) {
      return NextResponse.json(
        { error: "Product cost is required." },
        { status: 400 }
      );
    }

    const rawCost = body.productCost;

    if (
      (typeof rawCost !== "number" &&
        typeof rawCost !== "string") ||
      (typeof rawCost === "string" &&
        !/^\d+(\.\d{1,2})?$/.test(rawCost))
    ) {
      return NextResponse.json(
        { error: "Invalid product cost." },
        { status: 400 }
      );
    }

    const productCost = Number(rawCost);

    if (
      !Number.isFinite(productCost) ||
      productCost < 0 ||
      !Number.isSafeInteger(Math.round(productCost * 100)) ||
      Math.abs(
        productCost * 100 - Math.round(productCost * 100)
      ) > 0.000001
    ) {
      return NextResponse.json(
        {
          error:
            "Product cost must be a nonnegative amount with no more than two decimal places.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // STEP 4: Verify database configuration.
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
    // STEP 5: Update the order safely.
    //
    // Normal order:
    //   COST_NEEDED -> COMPLETED
    //
    // Partially refunded:
    //   PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED
    //
    // Fully refunded:
    //   REFUNDED -> Cannot save product cost
    //
    // The status check and update happen atomically.
    // ============================================================

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      const result = await pool.query(
        `
          UPDATE public."order"
          SET
            "productCost" = $1::numeric,
            status = CASE
              WHEN status = 'PARTIALLY_REFUNDED'
                THEN 'PARTIALLY_REFUNDED'
              ELSE 'COMPLETED'
            END,
            "updatedAt" = NOW()
          WHERE id = $2
            AND "userId" = $3
            AND status <> 'REFUNDED'
          RETURNING
            id,
            "ebayOrderId",
            item,
            "salePrice",
            "ebayFees",
            "productCost",
            status,
            "refundAmount",
            "refundedAt",
            "orderDate"
        `,
        [
          productCost.toFixed(2),
          orderId,
          user.id,
        ]
      );

      if (result.rowCount) {
        return NextResponse.json(result.rows[0]);
      }

      // Distinguish refunded orders from missing/unauthorized ones.
      const existing = await pool.query(
        `
          SELECT status
          FROM public."order"
          WHERE id = $1
            AND "userId" = $2
          LIMIT 1
        `,
        [orderId, user.id]
      );

      if (!existing.rowCount) {
        return NextResponse.json(
          { error: "Order not found." },
          { status: 404 }
        );
      }

      if (existing.rows[0].status === "REFUNDED") {
        return NextResponse.json(
          {
            error:
              "This order is fully refunded. Product cost entry is disabled.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Unable to update this order." },
        { status: 409 }
      );
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error("Failed to update order:", error);

    return NextResponse.json(
      { error: "Failed to update order." },
      { status: 500 }
    );
  }
}