import type { User } from "@supabase/supabase-js";
import type { Pool, PoolClient } from "pg";

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
export async function resolveActiveEbayUserId(db: Pool | PoolClient, user: User): Promise<string | null> {
  if (isAllStores(user)) return null;
  const result = await db.query<{ ebayUserId: string | null; updatedAt: string }>(
    `
    SELECT "ebayUserId", "updatedAt"
    FROM public."ebayConnection"
    WHERE "userId" = $1 AND environment = 'PRODUCTION'
    `,
    [user.id]
  );
  return pickConnection(result.rows, activeStoreId(user))?.ebayUserId ?? null;
}
