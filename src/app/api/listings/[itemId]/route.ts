import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

// Save a listing's cost per item. With applyToPast, also fill it into this
// listing's past sales that don't have a cost yet (never overwrites one).
export async function PATCH(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { itemId } = await params;
  if (!/^\d{1,20}$/.test(itemId)) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Which default to save: cost per item, or shipping per order.
  const field = body.field === "shippingCost" ? "shippingCost" : "unitCost";
  const raw = body[field];
  const clearing = raw === null || raw === "";
  const unitCost = clearing ? null : parseMoney(raw);
  if (!clearing && unitCost === null) {
    return NextResponse.json({ error: "Enter an amount like 8 or 8.50." }, { status: 400 });
  }
  const applyToPast = body.applyToPast === true && unitCost !== null;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const listing = await client.query<{ title: string; ebayUserId: string }>(
      `
      UPDATE public."EbayListing"
      SET "${field}" = $1::numeric, "updatedAt" = NOW()
      WHERE "userId" = $2 AND "ebayItemId" = $3 AND environment = 'PRODUCTION'
      RETURNING title, "ebayUserId"
      `,
      [unitCost, user.id, itemId]
    );
    if (!listing.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Listing not found. Try refreshing your listings." }, { status: 404 });
    }

    let applied = 0;
    if (applyToPast) {
      // Same matching as the Listings page: the saved listing ID, or (for
      // older orders without one) the exact same item title.
      // Cost per item is multiplied by units sold; shipping is per order.
      const setClause =
        field === "unitCost"
          ? `"productCost" = ROUND($1::numeric * GREATEST(COALESCE(o.quantity, 1), 1), 2), status = 'COMPLETED'`
          : `"shippingCost" = $1::numeric`;
      const target = field === "unitCost" ? `"productCost"` : `"shippingCost"`;
      const result = await client.query(
        `
        UPDATE public."order" o
        SET ${setClause},
            "updatedAt" = NOW()
        WHERE o."userId" = $2
          AND o.environment = 'PRODUCTION'
          AND o.${target} IS NULL
          AND o.status NOT IN ('REFUNDED', 'PARTIALLY_REFUNDED')
          AND COALESCE(o."refundAmount", 0) = 0
          AND (
            o."ebayItemId" = $3
            OR (
              o."ebayItemId" IS NULL
              AND regexp_replace(lower(btrim(o.item)), '\\s+', ' ', 'g')
                = regexp_replace(lower(btrim($4::text)), '\\s+', ' ', 'g')
            )
          )
        `,
        [unitCost, user.id, itemId, listing.rows[0].title]
      );
      applied = result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, field, value: unitCost, applied });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((e as { code?: string }).code === "42703") {
      return NextResponse.json(
        { error: "Shipping defaults need a one-time database update first (docs/sql/2026-11-07_shipping_cost.sql)." },
        { status: 409 }
      );
    }
    console.error("Saving listing cost failed:", e);
    return NextResponse.json({ error: "Couldn't save the cost. Please try again." }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}
