import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { existingColumns } from "@/lib/db/optionalColumns";
import { ALL_STORES, activeStoreId, isAllStores, pickConnection } from "@/lib/ebay/activeStore";
import { getUserPlan, lockedStoreIds } from "@/lib/billing/server";
import { ORDER_HISTORY_DAYS } from "@/lib/ebay/syncWindow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoreRow = {
  ebayUserId: string | null;
  updatedAt: string;
  refreshTokenExpiresAt: string;
  storeName?: string | null;
  ebayUsername?: string | null;
  lastOrderSyncAt?: Date | null;
  lastFullOrderSyncAt?: Date | null;
  createdAt: Date;
  firstOrderAt: Date | null;
};

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);

function dataFrom(row: StoreRow): string {
  const connected = new Date(row.createdAt).getTime() - ORDER_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const firstOrder = row.firstOrderAt ? new Date(row.firstOrderAt).getTime() : Infinity;
  return new Date(Math.min(connected, firstOrder)).toISOString();
}

function newPool() {
  return getPool();
}

async function loadStores(pool: Pool, userId: string) {
  const optional = await existingColumns(pool, "ebayConnection", [
    "storeName",
    "ebayUsername",
    "lastOrderSyncAt",
    "lastFullOrderSyncAt",
  ]);
  const extra = [...optional].map((c) => `, c."${c}"`).join("");
  const result = await pool.query<StoreRow>(
    `
    SELECT c."ebayUserId", c."updatedAt", c."refreshTokenExpiresAt", c."createdAt"${extra},
      (
        SELECT min(o."orderDate")
        FROM public."order" o
        WHERE o."userId" = c."userId" AND o."ebayUserId" = c."ebayUserId"
      ) AS "firstOrderAt"
    FROM public."ebayConnection" c
    WHERE c."userId" = $1 AND c.environment = 'PRODUCTION' AND c."ebayUserId" IS NOT NULL
    ORDER BY c."createdAt" ASC, c.id ASC
    `,
    [userId]
  );
  return result.rows;
}

// GET: the seller's connected eBay stores and which one is active.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ stores: [] });

  const pool = newPool();
  try {
    const rows = await loadStores(pool, user.id);
    // Stores beyond the plan's limit stay connected but locked.
    const { limits } = await getUserPlan(pool, user.id);
    const locked = lockedStoreIds(rows.map((row) => row.ebayUserId as string), limits);
    const usable = rows.filter((row) => !locked.has(row.ebayUserId as string));
    const allStores = isAllStores(user) && rows.length > 1 && limits.allStoresView && locked.size === 0;
    const active = allStores
      ? null
      : pickConnection(usable, isAllStores(user) ? null : activeStoreId(user))?.ebayUserId ?? null;
    return NextResponse.json(
      {
        allStores,
        canUseAllStores: limits.allStoresView && locked.size === 0,
        maxStores: limits.maxStores,
        stores: rows.map((row) => ({
          id: row.ebayUserId,
          name: row.storeName || row.ebayUsername || "eBay store",
          username: row.ebayUsername ?? null,
          active: row.ebayUserId === active,
          locked: locked.has(row.ebayUserId as string),
          // eBay sign-ins last about 18 months; after that, reconnect.
          needsReconnect: new Date(row.refreshTokenExpiresAt).getTime() <= Date.now(),
          // Shown in Settings → Syncing.
          lastSyncAt: iso(row.lastOrderSyncAt),
          lastFullSyncAt: iso(row.lastFullOrderSyncAt),
          // The earliest day ProfitSync has this store's orders from: eBay
          // only hands over the last year of orders, counted from when the
          // store was connected. The Taxes page warns when a year starts
          // before this.
          dataFrom: dataFrom(row),
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("Loading eBay stores failed:", e);
    return NextResponse.json({ error: "Couldn't load your eBay stores." }, { status: 500 });
  }
}

// POST { id }: switch the active store (saved on the ProfitSync account).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let id: unknown;
  try {
    id = ((await request.json()) as { id?: unknown }).id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Choose a store." }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = newPool();
  try {
    const rows = await loadStores(pool, user.id);
    if (id !== ALL_STORES && !rows.some((row) => row.ebayUserId === id)) {
      return NextResponse.json({ error: "That store isn't connected to your account." }, { status: 404 });
    }
    const { limits } = await getUserPlan(pool, user.id);
    const locked = lockedStoreIds(rows.map((row) => row.ebayUserId as string), limits);
    if (id === ALL_STORES ? !limits.allStoresView || locked.size > 0 : locked.has(id)) {
      return NextResponse.json(
        {
          error: id === ALL_STORES
            ? "The All stores view is part of the Pro and Ultimate plans."
            : "Your plan doesn't include this many stores. Upgrade to use this one.",
          upgrade: true,
        },
        { status: 402 }
      );
    }
    const { error: updateError } = await supabase.auth.updateUser({ data: { activeEbayUserId: id } });
    if (updateError) throw updateError;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Switching eBay store failed:", e);
    return NextResponse.json({ error: "Couldn't switch stores. Please try again." }, { status: 500 });
  }
}

// DELETE { id }: disconnect a store and delete its data from ProfitSync
// (orders, listings and the eBay connection). Nothing changes on eBay.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let id: unknown;
  try {
    id = ((await request.json()) as { id?: unknown }).id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Choose a store." }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = newPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const connection = await client.query(
      `DELETE FROM public."ebayConnection"
       WHERE "userId" = $1 AND environment = 'PRODUCTION' AND "ebayUserId" = $2`,
      [user.id, id]
    );
    if (!connection.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "That store isn't connected to your account." }, { status: 404 });
    }
    const orders = await client.query(
      `DELETE FROM public."order" WHERE "userId" = $1 AND environment = 'PRODUCTION' AND "ebayUserId" = $2`,
      [user.id, id]
    );
    const listings = await client.query(
      `DELETE FROM public."EbayListing" WHERE "userId" = $1 AND environment = 'PRODUCTION' AND "ebayUserId" = $2`,
      [user.id, id]
    );
    await client.query("COMMIT");

    // Forget it as the active store and drop its shipping default.
    const meta = user.user_metadata ?? {};
    const byStore = { ...((meta.defaultShippingByStore as Record<string, number> | undefined) ?? {}) };
    delete byStore[id];
    await supabase.auth.updateUser({
      data: {
        defaultShippingByStore: byStore,
        ...(activeStoreId(user) === id ? { activeEbayUserId: null } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      ordersDeleted: orders.rowCount ?? 0,
      listingsDeleted: listings.rowCount ?? 0,
    });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Removing eBay store failed:", e);
    return NextResponse.json({ error: "Couldn't remove the store. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
