import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { existingColumns } from "@/lib/db/optionalColumns";
import { tryAcquireSyncLock } from "@/lib/db/syncLock";
import { getUserPlan } from "@/lib/billing/server";
import { syncOrders } from "@/lib/ebay/orderSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Background sync, run by Vercel Cron (vercel.json). Brings in new orders,
// fees and refunds for every store on a plan with automatic sync, so the
// numbers are fresh even if the seller hasn't opened ProfitSync. The app
// also syncs on its own while it's open (see page.tsx).
//
// Vercel calls this with "Authorization: Bearer <CRON_SECRET>"; without the
// CRON_SECRET environment variable nothing runs.

// Stores synced in the last few hours (by the app or a previous run) are
// skipped.
const RECENT_MS = 3 * 60 * 60 * 1000;
// Stop starting new syncs well before the function's time limit.
const TIME_BUDGET_MS = 240_000;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type StoreRow = { userId: string; ebayUserId: string; lastOrderSyncAt?: Date | null };

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Background sync isn't set up (CRON_SECRET is missing)." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  }

  const started = Date.now();
  const pool = getPool();
  const environment = process.env.EBAY_ENVIRONMENT === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const tracksSyncs = (await existingColumns(pool, "ebayConnection", ["lastOrderSyncAt"])).has("lastOrderSyncAt");
  const { rows } = await pool.query<StoreRow>(
    `
    SELECT "userId", "ebayUserId"${tracksSyncs ? `, "lastOrderSyncAt"` : ""}
    FROM public."ebayConnection"
    WHERE environment = $1
      AND "ebayUserId" IS NOT NULL
      AND "refreshTokenExpiresAt" > now()
    ORDER BY ${tracksSyncs ? `"lastOrderSyncAt" ASC NULLS FIRST, ` : ""}id ASC
    `,
    [environment]
  );

  const plans = new Map<string, boolean>();
  const summary = { stores: rows.length, synced: 0, failed: 0, skippedPlan: 0, skippedRecent: 0, skippedBusy: 0, outOfTime: 0 };

  for (const store of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      summary.outOfTime++;
      continue;
    }
    if (store.lastOrderSyncAt && Date.now() - new Date(store.lastOrderSyncAt).getTime() < RECENT_MS) {
      summary.skippedRecent++;
      continue;
    }
    if (!plans.has(store.userId)) {
      plans.set(store.userId, (await getUserPlan(pool, store.userId)).limits.autoSync);
    }
    if (!plans.get(store.userId)) {
      summary.skippedPlan++;
      continue;
    }
    // Same lock as the Sync button: never two syncs for one account.
    const lock = await tryAcquireSyncLock(`orders:${store.userId}`);
    if (lock === "busy") {
      summary.skippedBusy++;
      continue;
    }
    try {
      const url = new URL("/api/ebay/sync", request.url);
      url.searchParams.set("store", store.ebayUserId);
      const response = await syncOrders(new Request(url, { method: "POST" }), undefined, { userId: store.userId });
      if (response.status < 400) summary.synced++;
      else summary.failed++;
    } catch (error) {
      console.error("Background sync failed for a store:", error);
      summary.failed++;
    } finally {
      await lock.release();
    }
  }

  console.log("ProfitSync background sync:", summary);
  return NextResponse.json(summary);
}
