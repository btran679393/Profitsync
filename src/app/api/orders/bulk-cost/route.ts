import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { fullyRefundedSql, statusWithCostSql } from "@/lib/refunds";
import { parseMoney } from "@/lib/parseMoney";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

// POST { items: [{ id, productCost }] }: saves product costs for many orders
// at once (the "Fill in suggested costs" button). Only fills orders of this
// seller that don't have a cost yet, so a cost someone typed is never
// overwritten. Returns the IDs that were filled.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await rateLimit("orderBulk", user.id);
  if (limited) return limited;

  let items: unknown;
  try {
    items = ((await request.json()) as { items?: unknown }).items;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_ITEMS} orders.` }, { status: 400 });
  }

  const ids: number[] = [];
  const costs: number[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const id = (item as { id?: unknown })?.id;
    const cost = parseMoney((item as { productCost?: unknown })?.productCost);
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || cost === null) {
      return NextResponse.json({ error: "Each order needs a valid ID and cost." }, { status: 400 });
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    costs.push(cost);
  }

  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  try {
    const result = await getPool().query<{ id: number }>(
      `
      UPDATE public."order" o
      SET "productCost" = v.cost, status = ${statusWithCostSql("o.")}, "updatedAt" = NOW()
      FROM unnest($1::int[], $2::numeric[]) AS v(id, cost)
      WHERE o.id = v.id
        AND o."userId" = $3
        AND o."productCost" IS NULL
        AND NOT ${fullyRefundedSql("o.")}
      RETURNING o.id
      `,
      [ids, costs, user.id]
    );
    return NextResponse.json({ updated: result.rows.map((row) => row.id) });
  } catch (e) {
    console.error("Saving costs in bulk failed:", e);
    return NextResponse.json({ error: "Couldn't save the costs. Please try again." }, { status: 500 });
  }
}
