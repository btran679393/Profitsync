import type { Pool, PoolClient } from "pg";
import { tag, tradingCall } from "./trading";

export type SellerProfile = { storeName: string | null; username: string | null };

// Ask eBay for the seller's username and (if they have an eBay Store) store name.
export async function fetchSellerProfile(accessToken: string): Promise<SellerProfile | null> {
  const [userCall, storeCall] = await Promise.all([
    tradingCall("GetUser", accessToken, "<DetailLevel>ReturnSummary</DetailLevel>"),
    // Sellers without an eBay Store subscription get an error here; that's fine.
    tradingCall("GetStore", accessToken, "<LevelLimit>1</LevelLimit>"),
  ]);
  if (!userCall.ok) return null;
  return {
    username: tag(tag(userCall.xml, "User") ?? "", "UserID") || null,
    storeName: storeCall.ok ? tag(tag(storeCall.xml, "Store") ?? "", "Name") || null : null,
  };
}

// Postgres "undefined column": the optional store-name columns haven't been
// added yet (see docs/sql/2026-11-07_ebay_store_name.sql).
export function isMissingColumn(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42703";
}

// Save the names on the seller's connection. Silently skipped if the
// columns don't exist yet.
export async function saveSellerProfile(
  db: Pool | PoolClient,
  connectionId: number,
  userId: string,
  profile: SellerProfile
) {
  try {
    await db.query(
      `
      UPDATE public."ebayConnection"
      SET "ebayUsername" = COALESCE($1, "ebayUsername"),
          "storeName" = $2
      WHERE id = $3 AND "userId" = $4
      `,
      [profile.username, profile.storeName, connectionId, userId]
    );
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
  }
}
