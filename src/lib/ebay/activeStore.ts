import type { User } from "@supabase/supabase-js";
import type { Pool, PoolClient } from "pg";

// Which connected eBay store the seller is currently looking at. Saved on the
// ProfitSync account (user_metadata.activeEbayUserId) so it follows them
// across devices. Falls back to the most recently connected/used store.

export function activeStoreId(user: User): string | null {
  const value = user.user_metadata?.activeEbayUserId;
  return typeof value === "string" && value.trim() ? value : null;
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

// The eBay account ID of the store to show, or null when no store is
// connected (then nothing is filtered, e.g. for older imported data).
export async function resolveActiveEbayUserId(db: Pool | PoolClient, user: User): Promise<string | null> {
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
