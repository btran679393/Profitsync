
import { createHmac } from "crypto";
import { Pool, type PoolClient } from "pg";
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

type Money = {
  value?: string;
  currency?: string;
};

type EbayOrder = {
  orderId: string;
  creationDate?: string;
  buyer?: {
    username?: string;
  };
  pricingSummary?: {
    total?: Money;
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

type EbayTransaction = {
  transactionId?: string;
  orderId?: string;
  transactionType?: string;
  totalFeeAmount?: Money;
};

type EbayTransactionsResponse = {
  total?: number;
  transactions?: EbayTransaction[];
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

function getIdentifierHashes(
  identifier: string,
  secret: string
): string[] {
  return [
    hashIdentifier(identifier, "userId", secret),
    hashIdentifier(identifier, "username", secret),
  ];
}

function parseMoney(money?: Money): number | null {
  if (!money || money.currency !== "USD") {
    return null;
  }

  if (
    typeof money.value !== "string" ||
    !/^\d+(\.\d{1,2})?$/.test(money.value)
  ) {
    return null;
  }

  const cents = Math.round(Number(money.value) * 100);

  return Number.isSafeInteger(cents) ? cents : null;
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Use the same deletion-protection locks as the
// existing order import and deletion webhook.
async function lockAndCheckIdentifiers(
  client: PoolClient,
  environment: string,
  identifiers: string[],
  hashSecret: string
): Promise<boolean> {
  const hashes = Array.from(
    new Set(
      identifiers.flatMap((identifier) =>
        getIdentifierHashes(identifier, hashSecret)
      )
    )
  ).sort();

  for (const hash of hashes) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`${environment}:${hash}`]
    );
  }

  const deleted = await client.query(
    `
    SELECT 1
    FROM public."ebayDeletedIdentifier"
    WHERE environment = $1
      AND "identifierHash" = ANY($2::text[])
    LIMIT 1
    `,
    [environment, hashes]
  );

  return Boolean(deleted.rowCount);
}

async function verifyActiveConnection(
  client: PoolClient,
  connectionId: string | number,
  userId: string,
  ebayUserId: string,
  environment: string
): Promise<void> {
  const active = await client.query(
    `
    SELECT 1
    FROM public."ebayConnection"
    WHERE id = $1
      AND "userId" = $2
      AND "ebayUserId" = $3
      AND environment = $4
    LIMIT 1
    `,
    [connectionId, userId, ebayUserId, environment]
  );

  if (!active.rowCount) {
    throw new Error(
      "eBay connection was removed during sync."
    );
  }
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

    const ebayFinancesBase =
      environment === "PRODUCTION"
        ? "https://apiz.ebay.com"
        : "https://apiz.sandbox.ebay.com";

    // STEP 3: Verify required configuration.
    const hashSecret =
      process.env.EBAY_DELETION_HASH_SECRET;

    const databaseUrl = process.env.DATABASE_URL;

    if (!hashSecret || !databaseUrl) {
      console.error(
        "Missing order deletion-protection configuration."
      );

      return NextResponse.json(
        { error: "Order sync protection unavailable." },
        { status: 503 }
      );
    }

    // STEP 4: Retrieve the connected eBay account.
    const connections =
      await db.orm.public.EbayConnection.where({
        userId,
        environment,
      }).all();

    const identifiedConnections = connections.filter(
      (connection) => Boolean(connection.ebayUserId)
    );

    if (identifiedConnections.length === 0) {
      return NextResponse.json(
        {
          error: "No eBay account connected.",
          message:
            "Please connect your eBay account before syncing.",
        },
        { status: 401 }
      );
    }

    if (identifiedConnections.length > 1) {
      return NextResponse.json(
        {
          error: "Multiple eBay accounts connected.",
          message:
            "Account selection must be configured before syncing.",
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

    // STEP 5: Refresh the token when necessary.
    const accessTokenExpiresAt = new Date(
      connection.accessTokenExpiresAt
    ).getTime();

    if (
      !Number.isFinite(accessTokenExpiresAt) ||
      accessTokenExpiresAt <= Date.now() + 60000
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
            message:
              "Please reconnect your eBay account.",
          },
          { status: 401 }
        );
      }

      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret =
        process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Missing eBay API credentials." },
          { status: 500 }
        );
      }

      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64");

      // Include the financial scope during refresh.
      const scopes = [
        "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
        "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
        "https://api.ebay.com/oauth/api_scope/sell.finances",
      ];

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        scope: scopes.join(" "),
      });

      const tokenResponse = await fetch(
        `${ebayApiBase}/identity/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
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
            error:
              "Unable to refresh eBay access token.",
            message:
              "Please reconnect your eBay account.",
          },
          { status: 401 }
        );
      }

      accessToken = tokenData.access_token;

      const newExpiration = new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString();

      await db.orm.public.EbayConnection.where({
        id: connection.id,
        userId,
      }).update({
        accessToken,
        accessTokenExpiresAt: newExpiration,
      });
    }

    // STEP 6: Retrieve the latest 20 eBay orders.
    const ordersResponse = await fetch(
      `${ebayApiBase}/sell/fulfillment/v1/order?limit=20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!ordersResponse.ok) {
      console.error(
        "eBay orders request failed:",
        ordersResponse.status
      );

      return NextResponse.json(
        {
          error: "Failed to retrieve eBay orders.",
          status: ordersResponse.status,
        },
        { status: 502 }
      );
    }

    const ordersData: EbayOrdersResponse =
      await ordersResponse.json();

    const ebayOrders = ordersData.orders ?? [];

    // STEP 7: Retrieve actual SALE transaction fees.
    const feesByOrder = new Map<string, number>();
    const seenTransactions = new Set<string>();

    const pageSize = 100;
    const maxPages = 10;

    let offset = 0;
    let feesComplete = false;

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        filter: "transactionType:{SALE}",
        limit: String(pageSize),
        offset: String(offset),
      });

      const financesResponse = await fetch(
        `${ebayFinancesBase}/sell/finances/v1/transaction?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );

      if (financesResponse.status === 204) {
        feesComplete = true;
        break;
      }

      if (!financesResponse.ok) {
        console.error(
          "eBay Finances API request failed:",
          financesResponse.status
        );

        return NextResponse.json(
          {
            error:
              "Unable to retrieve eBay selling fees.",
            message:
              "No orders were changed. Please try again.",
          },
          { status: 502 }
        );
      }

      const financesData: EbayTransactionsResponse =
        await financesResponse.json();

      const transactions =
        financesData.transactions ?? [];

      for (const transaction of transactions) {
        if (
          transaction.transactionType !== "SALE" ||
          !transaction.orderId ||
          !transaction.transactionId
        ) {
          continue;
        }

        if (
          seenTransactions.has(
            transaction.transactionId
          )
        ) {
          continue;
        }

        seenTransactions.add(
          transaction.transactionId
        );

        const feeCents = parseMoney(
          transaction.totalFeeAmount
        );

        if (feeCents === null) {
          continue;
        }

        const previousFees =
          feesByOrder.get(transaction.orderId) ?? 0;

        feesByOrder.set(
          transaction.orderId,
          previousFees + feeCents
        );
      }

      offset += transactions.length;

      if (
        transactions.length === 0 ||
        transactions.length < pageSize ||
        (
          typeof financesData.total === "number" &&
          offset >= financesData.total
        )
      ) {
        feesComplete = true;
        break;
      }
    }

    if (!feesComplete) {
      return NextResponse.json(
        {
          error:
            "Financial transaction pagination limit reached.",
          message:
            "No orders were changed. Increase the pagination limit.",
        },
        { status: 503 }
      );
    }

    // STEP 8: Retrieve existing ProfitSync orders.
    const existingOrders =
      await db.orm.public.Order.where({
        userId,
        ebayUserId,
        environment,
      }).all();

    const existingIds = new Set(
      existingOrders
        .map((order) => order.ebayOrderId)
        .filter(
          (id): id is string => id !== null
        )
    );

    let imported = 0;
    let skipped = 0;
    let feesUpdated = 0;
    let feesUnavailable = 0;

    // STEP 9: Open a protected PostgreSQL connection.
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      const client = await pool.connect();

      try {
        // STEP 10: Import new orders.
        for (const ebayOrder of ebayOrders) {
          if (
            !ebayOrder.orderId ||
            existingIds.has(ebayOrder.orderId)
          ) {
            skipped++;
            continue;
          }

          const buyerId =
            ebayOrder.buyer?.username?.trim();

          if (!buyerId) {
            skipped++;
            continue;
          }

          const totalCents = parseMoney(
            ebayOrder.pricingSummary?.total
          );

          if (totalCents === null) {
            skipped++;
            continue;
          }

          const item =
            ebayOrder.lineItems
              ?.map((lineItem) => lineItem.title)
              .filter(Boolean)
              .join(", ") || "eBay Order";

          const feeCents = feesByOrder.get(
            ebayOrder.orderId
          );

          let transactionStarted = false;

          try {
            await client.query("BEGIN");
            transactionStarted = true;

            const deleted =
              await lockAndCheckIdentifiers(
                client,
                environment,
                [ebayUserId, buyerId],
                hashSecret
              );

            if (deleted) {
              await client.query("COMMIT");
              transactionStarted = false;
              skipped++;
              continue;
            }

            await verifyActiveConnection(
              client,
              connection.id,
              userId,
              ebayUserId,
              environment
            );

            const duplicate = await client.query(
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

            if (duplicate.rowCount) {
              await client.query("COMMIT");
              transactionStarted = false;

              existingIds.add(
                ebayOrder.orderId
              );

              skipped++;
              continue;
            }

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
                formatMoney(totalCents),
                feeCents !== undefined
                  ? formatMoney(feeCents)
                  : "0.00",
                null,
                "COST_NEEDED",
                ebayOrder.creationDate || null,
              ]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            existingIds.add(
              ebayOrder.orderId
            );

            imported++;

            if (feeCents === undefined) {
              feesUnavailable++;
            }
          } catch (error) {
            if (transactionStarted) {
              try {
                await client.query("ROLLBACK");
              } catch (rollbackError) {
                console.error(
                  "Order import rollback failed:",
                  rollbackError
                );
              }
            }

            throw error;
          }
        }

        // STEP 11: Update fees on existing orders.
        //
        // Only ebayFees and updatedAt are changed.
        // Product costs and sale prices are preserved.
        for (const order of existingOrders) {
          if (!order.ebayOrderId) {
            continue;
          }

          const feeCents = feesByOrder.get(
            order.ebayOrderId
          );

          if (feeCents === undefined) {
            feesUnavailable++;
            continue;
          }

          if (!order.ebayBuyerId) {
            skipped++;
            continue;
          }

          let transactionStarted = false;

          try {
            await client.query("BEGIN");
            transactionStarted = true;

            const deleted =
              await lockAndCheckIdentifiers(
                client,
                environment,
                [
                  ebayUserId,
                  order.ebayBuyerId,
                ],
                hashSecret
              );

            if (deleted) {
              await client.query("COMMIT");
              transactionStarted = false;
              skipped++;
              continue;
            }

            await verifyActiveConnection(
              client,
              connection.id,
              userId,
              ebayUserId,
              environment
            );

            const newFee = formatMoney(feeCents);

            const result = await client.query(
              `
              UPDATE public."order"
              SET "ebayFees" = $1,
                  "updatedAt" = NOW()
              WHERE id = $2
                AND "userId" = $3
                AND "ebayUserId" = $4
                AND environment = $5
                AND "ebayOrderId" = $6
                AND "ebayBuyerId" = $7
                AND "ebayFees" IS DISTINCT FROM $1::numeric
              `,
              [
                newFee,
                order.id,
                userId,
                ebayUserId,
                environment,
                order.ebayOrderId,
                order.ebayBuyerId,
              ]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            if (result.rowCount) {
              feesUpdated++;
            }
          } catch (error) {
            if (transactionStarted) {
              try {
                await client.query("ROLLBACK");
              } catch (rollbackError) {
                console.error(
                  "Fee update rollback failed:",
                  rollbackError
                );
              }
            }

            throw error;
          }
        }
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }

    // STEP 12: Return sync results.
    return NextResponse.json({
      success: true,
      environment,
      found: ebayOrders.length,
      imported,
      skipped,
      feesUpdated,
      feesUnavailable,
      financialOrdersMatched: feesByOrder.size,
      message:
        `Imported ${imported} new orders. ` +
        `Updated fees on ${feesUpdated} existing orders.`,
    });
  } catch (error) {
    console.error(
      "Failed to sync eBay orders:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong syncing eBay orders.",
      },
      { status: 500 }
    );
  }
}
