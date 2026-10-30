import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/prisma/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Offer = {
  offerId?: string;
  sku?: string;
  listing?: {
    listingId?: string;
    listingStatus?: string;
  };
  pricingSummary?: {
    price?: {
      value?: string;
      currency?: string;
    };
  };
  availableQuantity?: number;
  status?: string;
};

type OffersPage = {
  offers?: Offer[];
  total?: number;
};

type InventoryItem = {
  product?: {
    title?: string;
    imageUrls?: string[];
  };
  availability?: {
    shipToLocationAvailability?: {
      quantity?: number;
    };
  };
};

export async function POST() {
  let pool: Pool | null = null;

  try {
    // ============================================================
    // STEP 1: Authenticate the signed-in ProfitSync user
    // ============================================================

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Sign in required." },
        { status: 401 }
      );
    }

    // ============================================================
    // STEP 2: Verify database configuration
    // ============================================================

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      return NextResponse.json(
        { error: "DATABASE_URL missing." },
        { status: 503 }
      );
    }

    // ============================================================
    // STEP 3: Select the user's PRODUCTION eBay connection
    //
    // Your database contains:
    // ID 1: Old SANDBOX connection
    // ID 2: PRODUCTION connection
    //
    // Only use the production connection.
    // ============================================================

    const environment = "PRODUCTION";

    const api = "https://api.ebay.com";

    const connections =
      await db.orm.public.EbayConnection.where({
        userId: user.id,
        environment: "PRODUCTION",
      }).all();

    const validConnections = connections.filter(
      (connection) =>
        Boolean(connection.ebayUserId) &&
        Boolean(connection.accessToken)
    );

    if (validConnections.length === 0) {
      return NextResponse.json(
        {
          error:
            "No production eBay account connected. Please connect your eBay account.",
        },
        { status: 409 }
      );
    }

    // Select the most recently updated production connection.
    const connection = [...validConnections].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime()
    )[0];

    if (!connection.ebayUserId) {
      return NextResponse.json(
        { error: "Missing eBay account ID." },
        { status: 400 }
      );
    }

    // ============================================================
    // STEP 4: Check eBay access token expiration
    // ============================================================

    const expiresAt = new Date(
      connection.accessTokenExpiresAt
    ).getTime();

    if (!Number.isFinite(expiresAt)) {
      return NextResponse.json(
        {
          error: "Invalid eBay access token expiration date.",
        },
        { status: 401 }
      );
    }

    if (expiresAt <= Date.now() + 60000) {
      return NextResponse.json(
        {
          error:
            "Your eBay access token has expired. Run your existing order synchronization to refresh it, then retry.",
        },
        { status: 401 }
      );
    }

    // ============================================================
    // STEP 5: Configure eBay API headers
    // ============================================================

    const headers = {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // ============================================================
    // STEP 6: Retrieve active eBay offers
    // ============================================================

    const offers: Offer[] = [];

    for (
      let offset = 0, page = 0;
      page < 100;
      page++
    ) {
      const response = await fetch(
        `${api}/sell/inventory/v1/offer?limit=100&offset=${offset}`,
        {
          method: "GET",
          headers,
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "eBay Inventory API error:",
          response.status,
          errorText
        );

        return NextResponse.json(
          {
            error:
              `Failed to retrieve eBay listings. HTTP ${response.status}.`,
            details:
              response.status === 403
                ? "Your eBay connection may be missing the sell.inventory OAuth permission."
                : "Check your eBay connection and API permissions.",
          },
          { status: 502 }
        );
      }

      const data =
        (await response.json()) as OffersPage;

      const batch = data.offers ?? [];

      offers.push(...batch);

      offset += batch.length;

      if (
        batch.length < 100 ||
        (typeof data.total === "number" &&
          offset >= data.total)
      ) {
        break;
      }

      if (page === 99) {
        return NextResponse.json(
          { error: "Offer pagination limit reached." },
          { status: 502 }
        );
      }
    }

    // ============================================================
    // STEP 7: Filter active listings
    // ============================================================

    const activeOffers = offers.filter(
      (offer) =>
        Boolean(offer.listing?.listingId) &&
        (offer.status === "PUBLISHED" ||
          offer.listing?.listingStatus === "ACTIVE")
    );

    // ============================================================
    // STEP 8: Connect to PostgreSQL
    // ============================================================

    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });

    const client = await pool.connect();

    let saved = 0;
    let skipped = 0;

    try {
      // ==========================================================
      // STEP 9: Import each active listing
      // ==========================================================

      for (const offer of activeOffers) {
        const itemId = offer.listing?.listingId;

        if (!itemId || !offer.sku) {
          skipped++;
          continue;
        }

        const price = offer.pricingSummary?.price;

        if (
          !price ||
          price.currency !== "USD" ||
          !price.value ||
          !Number.isFinite(Number(price.value)) ||
          Number(price.value) < 0
        ) {
          skipped++;
          continue;
        }

        // Retrieve the inventory item's details.
        const inventoryResponse = await fetch(
          `${api}/sell/inventory/v1/inventory_item/${encodeURIComponent(
            offer.sku
          )}`,
          {
            method: "GET",
            headers,
            cache: "no-store",
          }
        );

        if (!inventoryResponse.ok) {
          console.error(
            `Failed to retrieve inventory item: ${offer.sku}`,
            inventoryResponse.status
          );

          skipped++;
          continue;
        }

        const inventoryItem =
          (await inventoryResponse.json()) as InventoryItem;

        const title = inventoryItem.product?.title;

        if (!title) {
          skipped++;
          continue;
        }

        // ========================================================
        // STEP 10: Retrieve the listing image
        // ========================================================

        const imageUrl =
          inventoryItem.product?.imageUrls?.find(
            (url) => {
              try {
                const parsed = new URL(url);

                return (
                  parsed.protocol === "https:" &&
                  (parsed.hostname === "ebayimg.com" ||
                    parsed.hostname.endsWith(
                      ".ebayimg.com"
                    ))
                );
              } catch {
                return false;
              }
            }
          ) ?? null;

        // ========================================================
        // STEP 11: Calculate available quantity
        // ========================================================

        const quantity = Math.max(
          0,
          Math.trunc(
            offer.availableQuantity ??
              inventoryItem.availability
                ?.shipToLocationAvailability
                ?.quantity ??
              0
          )
        );

        // ========================================================
        // STEP 12: Save or update the listing
        // ========================================================

        await client.query(
          `
          INSERT INTO public."EbayListing" (
            "userId",
            "ebayUserId",
            environment,
            "ebayItemId",
            title,
            sku,
            "imageUrl",
            "listingPrice",
            quantity,
            status,
            "updatedAt"
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, 'ACTIVE', NOW()
          )
          ON CONFLICT (
            "userId",
            "ebayUserId",
            environment,
            "ebayItemId"
          )
          DO UPDATE SET
            title = EXCLUDED.title,
            sku = EXCLUDED.sku,
            "imageUrl" = EXCLUDED."imageUrl",
            "listingPrice" = EXCLUDED."listingPrice",
            quantity = EXCLUDED.quantity,
            status = 'ACTIVE',
            "updatedAt" = NOW()
          `,
          [
            user.id,
            connection.ebayUserId,
            environment,
            itemId,
            title,
            offer.sku,
            imageUrl,
            price.value,
            quantity,
          ]
        );

        saved++;
      }
    } finally {
      client.release();
    }

    // ============================================================
    // STEP 13: Return synchronization results
    // ============================================================

    return NextResponse.json({
      success: true,
      environment,
      ebayUserId: connection.ebayUserId,
      totalOffers: offers.length,
      activeOffersFound: activeOffers.length,
      saved,
      skipped,
      message:
        "Active eBay listing synchronization completed.",
      note:
        "The Inventory API may not return listings created using older eBay listing tools.",
    });
  } catch (error) {
    console.error(
      "ProfitSync listing synchronization failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Listing synchronization failed.",
      },
      { status: 500 }
    );
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}