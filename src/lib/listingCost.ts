import type { PoolClient } from "pg";
import { fullyRefundedSql, statusWithCostSql } from "@/lib/refunds";

// Saves a listing's cost per item (or shipping per order) and, with
// applyToPast, fills it into that listing's sales that don't have one yet
// (never overwrites a cost the seller typed). `since` limits that to sales
// on or after a date, e.g. when stock was bought.
// Used by the Listings page and by Inventory when an item is linked to a
// listing. Returns null when the listing isn't the seller's.
export async function saveListingCost(
  client: PoolClient,
  {
    userId,
    itemId,
    field,
    value,
    applyToPast,
    since = null,
  }: {
    userId: string;
    itemId: string;
    field: "unitCost" | "shippingCost";
    value: number | null;
    applyToPast: boolean;
    since?: string | null;
  }
): Promise<{ applied: number } | null> {
  const listing = await client.query<{ title: string }>(
    `
    UPDATE public."EbayListing"
    SET "${field}" = $1::numeric, "updatedAt" = NOW()
    WHERE "userId" = $2 AND "ebayItemId" = $3 AND environment = 'PRODUCTION'
    RETURNING title
    `,
    [value, userId, itemId]
  );
  if (!listing.rowCount) return null;
  if (!applyToPast || value === null) return { applied: 0 };

  // Same matching as the Listings page: the saved listing ID, or (for
  // older orders without one) the exact same item title.
  // Cost per item is multiplied by units sold; shipping is per order.
  const setClause =
    field === "unitCost"
      ? `"productCost" = ROUND($1::numeric * GREATEST(COALESCE(o.quantity, 1), 1), 2), status = ${statusWithCostSql("o.")}`
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
      AND NOT ${fullyRefundedSql("o.")}
      AND ($5::date IS NULL OR o."orderDate" >= $5::date)
      AND (
        o."ebayItemId" = $3
        OR (
          o."ebayItemId" IS NULL
          AND regexp_replace(lower(btrim(o.item)), '\\s+', ' ', 'g')
            = regexp_replace(lower(btrim($4::text)), '\\s+', ' ', 'g')
        )
      )
    `,
    [value, userId, itemId, listing.rows[0].title, since]
  );
  return { applied: result.rowCount ?? 0 };
}
