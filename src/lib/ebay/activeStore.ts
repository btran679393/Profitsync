import type { User } from "@supabase/supabase-js";
import type { Pool, PoolClient } from "pg";
import { connectedStoreIds, getUserPlan, lockedStoreIds } from "@/lib/billing/server";

// Which connected eBay store the seller is currently looking at. Saved on the
// ProfitSync account (user_metadata.activeEbayUserId) so it follows them
// across devices. ALL_STORES means "show every store combined". Falls back to
// the most recently connected/used store.

export const ALL_STORES = "__all__";

export function activeStoreId(user: User): string | null {
  const value = user.user_metadata?.activeEbayUserId;
  return typeof value === "string" && value.trim() ? value : null;
}

export function isAllStores(user: User) {
  return activeStoreId(user) === ALL_STORES;
}

export function pickConnection<T extends { ebayUserId: string | null; updatedAt: string | Date }>(
  connections: T[],
  activeId: string | null
): T | undefined {
  const usable = connections.filter((c) => Boolean(c.ebayUserId));
  return (
    (activeId ? usable.find((c) => c.ebayUserId === activeId) : undefined) ??
    [...usable].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
  );
}

// Which store an eBay sync should use: an explicit ?store= from the request
// (used when syncing every store in the "All stores" view), otherwise the
// active store.
export function storeForSync(user: User, request: Request): string | null {
  const requested = new URL(request.url).searchParams.get("store");
  if (requested && requested !== ALL_STORES) return requested;
  const active = activeStoreId(user);
  return active === ALL_STORES ? null : active;
}

// The eBay account ID whose data to show, or null for no filter: either the
// "All stores" view, or no store connected (e.g. older imported data).
// Stores locked by the seller's plan are skipped, and "All stores" only
// applies when the plan includes it and no store is locked.
export async function resolveActiveEbayUserId(db: Pool | PoolClient, user: User): Promise<string | null> {
  const result = await db.query<{ ebayUserId: string | null; updatedAt: string }>(
    `
    SELECT "ebayUserId", "updatedAt"
    FROM public."ebayConnection"
    WHERE "userId" = $1 AND environment = 'PRODUCTION'
    ORDER BY "createdAt" ASC, id ASC
    `,
    [user.id]
  );
  const { limits } = await getUserPlan(db, user.id);
  const ids = result.rows.map((row) => row.ebayUserId).filter((id): id is string => Boolean(id));
  const locked = lockedStoreIds(ids, limits);
  if (isAllStores(user) && limits.allStoresView && locked.size === 0) return null;
  const usable = result.rows.filter((row) => row.ebayUserId && !locked.has(row.ebayUserId));
  return pickConnection(usable, isAllStores(user) ? null : activeStoreId(user))?.ebayUserId ?? null;
}

// Whether the plan lets the seller use this store (sync it, view it).
export async function storeAllowedByPlan(db: Pool | PoolClient, userId: string, ebayUserId: string) {
  const { limits } = await getUserPlan(db, userId);
  return !lockedStoreIds(await connectedStoreIds(db, userId), limits).has(ebayUserId);
}
