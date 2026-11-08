import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumn } from "@/lib/db/optionalColumns";
import { setupNeeded } from "@/lib/setupNeeded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LISTINGS = 500;

function parseMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

// Set cost per item or shipping per order on many listings at once.
// With applyToPast, also fill their past sales that have no amount yet
// (never overwrites one). Body: { itemIds, field, value, applyToPast }.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const itemIds = Array.isArray(body.itemIds)
    ? [...new Set(body.itemIds.filter((id): id is string => typeof id === "string" && /^\d{1,20}$/.test(id)))]
    : [];
  if (itemIds.length === 0 || itemIds.length > MAX_LISTINGS) {
    return NextResponse.json({ error: `Select between 1 and ${MAX_LISTINGS} listings.` }, { status: 400 });
  }
  const field = body.field === "shippingCost" ? "shippingCost" : "unitCost";
  const value = parseMoney(body.value);
  if (value === null) {
    return NextResponse.json({ error: "Enter an amount like 8 or 8.50." }, { status: 400 });
  }
  const applyToPast = body.applyToPast === true;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const listings = await client.query(
      `
      UPDATE public."EbayListing"
      SET "${field}" = $1::numeric, "updatedAt" = NOW()
      WHERE "userId" = $2 AND environment = 'PRODUCTION' AND "ebayItemId" = ANY($3::text[])
      RETURNING "ebayItemId"
      `,
      [value, user.id, itemIds]
    );

    let applied = 0;
    if (applyToPast && listings.rowCount) {
      // Same matching as the Listings page: the saved listing ID, or (for
      // older orders without one) the exact same item title.
      const setClause =
        field === "unitCost"
          ? `"productCost" = ROUND($1::numeric * GREATEST(COALESCE(o.quantity, 1), 1), 2), status = 'COMPLETED'`
          : `"shippingCost" = $1::numeric`;
      const target = field === "unitCost" ? `"productCost"` : `"shippingCost"`;
      const result = await client.query(
        `
        UPDATE public."order" o
        SET ${setClause}, "updatedAt" = NOW()
        FROM (
          SELECT "ebayItemId", regexp_replace(lower(btrim(title)), '\\s+', ' ', 'g') AS norm_title
          FROM public."EbayListing"
          WHERE "userId" = $2 AND environment = 'PRODUCTION' AND "ebayItemId" = ANY($3::text[])
        ) l
        WHERE o."userId" = $2
          AND o.environment = 'PRODUCTION'
          AND o.${target} IS NULL
          AND o.status NOT IN ('REFUNDED', 'PARTIALLY_REFUNDED')
          AND COALESCE(o."refundAmount", 0) = 0
          AND (
            o."ebayItemId" = l."ebayItemId"
            OR (o."ebayItemId" IS NULL AND regexp_replace(lower(btrim(o.item)), '\\s+', ' ', 'g') = l.norm_title)
          )
        `,
        [value, user.id, itemIds]
      );
      applied = result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, updated: listings.rowCount ?? 0, applied });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (isMissingColumn(e)) {
      return NextResponse.json(
        { error: setupNeeded("Shipping defaults", "docs/sql/2026-11-07_shipping_cost.sql") },
        { status: 409 }
      );
    }
    console.error("Bulk listing update failed:", e);
    return NextResponse.json({ error: "Couldn't update the listings. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
