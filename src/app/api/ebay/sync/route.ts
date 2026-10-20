
import { createHmac } from "crypto";
import { Pool } from "pg";
import { NextResponse } from "next/server";
import { db } from "@/prisma/db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type EbayOrder = {
  orderId: string;
  creationDate?: string;
  buyer?: {
    username?: string;
  };
  pricingSummary?: {
    total?: {
      value?: string;
      currency?: string;
    };
  };
  lineItems?: {
    title?: string;
    quantity?: number;
  }[];
};

type EbayOrdersResponse = {
  total?: number;
  orders?: EbayOrder[];
};

function hashIdentifier(
  identifier: string,
  identifierType: "userId" | "username",
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${identifierType}:${identifier}`)
    .digest("hex");
}

// eBay may return either an immutable user ID or a
// username in its buyer.username field.
function getIdentifierHashes(
  identifier: string,
  secret: string
): string[] {
  return [
    hashIdentifier(identifier, "userId", secret),
    hashIdentifier(identifier, "username", secret),
  ];
}

export async function POST() {
  try {
    // STEP 1: Authenticate the ProfitSync user.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const userId = user.id;

    // STEP 2: Determine the eBay environment.
    const environment =
      process.env.EBAY_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX";

    const ebayApiBase =
      environment === "PRODUCTION"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

    // STEP 3: Verify deletion-protection configuration.
    const hashSecret = process.env.EBAY_DELETION_HASH_SECRET;
    const databaseUrl = process.env.DATABASE_URL;

    if (!hashSecret || !databaseUrl) {
      console.error("Missing deletion-protection configuration.");

      return NextResponse.json(
        { error: "Order sync protection unavailable." },
        { status: 503 }
      );
    }

    // STEP 4: Retrieve this user's eBay connection.
    const connections = await db.orm.public.EbayConnection
      .where({
        userId,
        environment,
      })
      .all();

    const identifiedConnections = connections.filter(
      (connection) => Boolean(connection.ebayUserId)
    );

    if (identifiedConnections.length === 0) {
      return NextResponse.json(
        {
          error: "No eBay account connected.",
          message: "Please connect your eBay account before syncing.",
        },
        { status: 401 }
      );
    }

    if (identifiedConnections.length > 1) {
      return NextResponse.json(
        {
          error: "Multiple eBay accounts connected.",
          message: "Account selection must be configured before syncing.",
        },
        { status: 409 }
      );
    }

    const connection = identifiedConnections[0];
    const ebayUserId = connection.ebayUserId;

    if (!ebayUserId) {
      return NextResponse.json(
        { error: "Connected eBay account has no user ID." },
        { status: 401 }
      );
    }

    let accessToken = connection.accessToken;

    // STEP 5: Check whether the access token expired.
    const accessTokenExpiresAt = new Date(
      connection.accessTokenExpiresAt
    ).getTime();

    if (
      !Number.isFinite(accessTokenExpiresAt) ||
      accessTokenExpiresAt <= Date.now() + 60_000
    ) {
      const refreshTokenExpiresAt = new Date(
        connection.refreshTokenExpiresAt
      ).getTime();

      if (
        !Number.isFinite(refreshTokenExpiresAt) ||
        refreshTokenExpiresAt <= Date.now()
      ) {
        return NextResponse.json(
          {
            error: "eBay refresh token expired.",
            message: "Please reconnect your eBay account.",
          },
          { status: 401 }
        );
      }

      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret = process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Missing eBay API credentials." },
          { status: 500 }
        );
      }

      // STEP 6: Refresh the eBay access token.
      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64");

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        scope:
          "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
      });

      const tokenResponse = await fetch(
        `${ebayApiBase}/identity/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
          },
          body: body.toString(),
          cache: "no-store",
        }
      );

      const tokenData: EbayTokenResponse =
        await tokenResponse.json();

      if (
        !tokenResponse.ok ||
        !tokenData.access_token ||
        !tokenData.expires_in
      ) {
        console.error("eBay token refresh failed:", {
          status: tokenResponse.status,
          error: tokenData.error,
          description: tokenData.error_description,
        });

        return NextResponse.json(
          {
            error: "Unable to refresh eBay access token.",
            message: "Please reconnect your eBay account.",
          },
          { status: 401 }
        );
      }

      accessToken = tokenData.access_token;

      const newExpiration = new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString();

      await db.orm.public.EbayConnection
        .where({
          id: connection.id,
          userId,
        })
        .update({
          accessToken,
          accessTokenExpiresAt: newExpiration,
        });
    }

    // STEP 7: Fetch orders from eBay.
    const response = await fetch(
      `${ebayApiBase}/sell/fulfillment/v1/order?limit=20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("eBay orders request failed:", response.status);

      return NextResponse.json(
        {
          error: "Failed to retrieve eBay orders.",
          status: response.status,
        },
        { status: 502 }
      );
    }

    const data: EbayOrdersResponse = await response.json();
    const ebayOrders = data.orders ?? [];

    // STEP 8: Retrieve existing orders.
    const existingOrders = await db.orm.public.Order
      .where({
        userId,
        ebayUserId,
        environment,
      })
      .all();

    const existingIds = new Set(
      existingOrders
        .map((order) => order.ebayOrderId)
        .filter((id): id is string => id !== null)
    );

    let imported = 0;
    let skipped = 0;

    // STEP 9: Connect to PostgreSQL for protected imports.
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      const client = await pool.connect();

      try {
        // Process each order in its own transaction.
        for (const ebayOrder of ebayOrders) {
          if (!ebayOrder.orderId) {
            skipped++;
            continue;
          }

          if (existingIds.has(ebayOrder.orderId)) {
            skipped++;
            continue;
          }

          const buyerId = ebayOrder.buyer?.username?.trim();

          // Do not import an order if we cannot identify
          // its buyer for deletion-protection checks.
          if (!buyerId) {
            skipped++;
            continue;
          }

          const total = ebayOrder.pricingSummary?.total?.value;

          if (
            !total ||
            !Number.isFinite(Number(total)) ||
            Number(total) < 0
          ) {
            skipped++;
            continue;
          }

          const item =
            ebayOrder.lineItems
              ?.map((lineItem) => lineItem.title)
              .filter(Boolean)
              .join(", ") || "eBay Order";

          // Check both identifier formats for the seller
          // and buyer, because eBay may return either.
          const identifierHashes = Array.from(
            new Set([
              ...getIdentifierHashes(ebayUserId, hashSecret),
              ...getIdentifierHashes(buyerId, hashSecret),
            ])
          ).sort();

          let transactionStarted = false;

          try {
            await client.query("BEGIN");
            transactionStarted = true;

            // Use the same locks as the deletion webhook.
            // Consistent ordering prevents lock deadlocks.
            for (const identifierHash of identifierHashes) {
              await client.query(
                "SELECT pg_advisory_xact_lock(hashtext($1))",
                [`${environment}:${identifierHash}`]
              );
            }

            // Block imports for deleted buyers or sellers.
            const deletedAccount = await client.query(
              `
              SELECT 1
              FROM public."ebayDeletedIdentifier"
              WHERE environment = $1
                AND "identifierHash" = ANY($2::text[])
              LIMIT 1
              `,
              [environment, identifierHashes]
            );

            if (deletedAccount.rowCount) {
              await client.query("COMMIT");
              transactionStarted = false;
              skipped++;
              continue;
            }

            // Check that the seller connection still exists.
            // A deletion webhook may have disconnected it.
            const activeConnection = await client.query(
              `
              SELECT 1
              FROM public."ebayConnection"
              WHERE id = $1
                AND "userId" = $2
                AND "ebayUserId" = $3
                AND environment = $4
              LIMIT 1
              `,
              [connection.id, userId, ebayUserId, environment]
            );

            if (!activeConnection.rowCount) {
              throw new Error(
                "eBay connection was removed during sync."
              );
            }

            // Recheck duplicates inside the transaction.
            const duplicateOrder = await client.query(
              `
              SELECT 1
              FROM public."order"
              WHERE "userId" = $1
                AND "ebayUserId" = $2
                AND environment = $3
                AND "ebayOrderId" = $4
              LIMIT 1
              `,
              [
                userId,
                ebayUserId,
                environment,
                ebayOrder.orderId,
              ]
            );

            if (duplicateOrder.rowCount) {
              await client.query("COMMIT");
              transactionStarted = false;
              existingIds.add(ebayOrder.orderId);
              skipped++;
              continue;
            }

            // Insert the order while the deletion locks
            // are still held.
            await client.query(
              `
              INSERT INTO public."order" (
                "userId",
                "ebayOrderId",
                "ebayUserId",
                "ebayBuyerId",
                environment,
                item,
                "salePrice",
                "ebayFees",
                "productCost",
                status,
                "orderDate",
                "updatedAt"
              )
              VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                COALESCE($11::timestamptz, NOW()),
                NOW()
              )
              `,
              [
                userId,
                ebayOrder.orderId,
                ebayUserId,
                buyerId,
                environment,
                item,
                Number(total).toFixed(2),
                "0.00",
                null,
                "COST_NEEDED",
                ebayOrder.creationDate || null,
              ]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            existingIds.add(ebayOrder.orderId);
            imported++;
          } catch (error) {
            if (transactionStarted) {
              try {
                await client.query("ROLLBACK");
              } catch (rollbackError) {
                console.error(
                  "Order sync rollback failed:",
                  rollbackError
                );
              }
            }

            // Stop syncing if deletion protection or
            // database insertion cannot be completed.
            throw error;
          }
        }
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }

    // STEP 10: Return the sync results.
    return NextResponse.json({
      success: true,
      environment,
      found: ebayOrders.length,
      imported,
      skipped,
      message: `Imported ${imported} new eBay orders.`,
    });
  } catch (error) {
    console.error("Failed to sync eBay orders:", error);

    return NextResponse.json(
      {
        error: "Something went wrong syncing eBay orders.",
      },
      { status: 500 }
    );
  }
}
