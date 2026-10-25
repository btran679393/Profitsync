import { createHmac } from "crypto";
import { Pool, type PoolClient } from "pg";
import { NextResponse } from "next/server";

import { db } from "@/prisma/db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// TYPES
// ============================================================

type Money = {
  value?: string;
  currency?: string;
};

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type EbayLineItem = {
  title?: string;
  quantity?: number;
  legacyItemId?: string;
  legacyVariationId?: string;
  sku?: string;
  image?: {
    imageUrl?: string;
  };
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

  lineItems?: EbayLineItem[];
};

type EbayOrdersResponse = {
  total?: number;
  orders?: EbayOrder[];
};

type EbayTransaction = {
  transactionId?: string;
  orderId?: string;
  transactionType?: string;
  transactionDate?: string;
  totalFeeAmount?: Money;
  amount?: Money;
  bookingEntry?: string;
};

type EbayTransactionsResponse = {
  total?: number;
  transactions?: EbayTransaction[];
};

type EbayBrowseItem = {
  image?: {
    imageUrl?: string;
  };
};

type RefundInfo = {
  amountCents: number;
  refundedAt: string | null;
};

type FinancialData = {
  feesByOrder: Map<string, number>;
  refundsByOrder: Map<string, RefundInfo>;
};

type ExistingOrder = {
  id: number;
  ebayOrderId: string | null;
  ebayBuyerId: string | null;
  ebayFees: unknown;
  imageUrl: string | null;
};

type PreparedOrder = {
  orderId: string;
  buyerId: string;
  item: string;
  saleCents: number;
  feeCents: number | undefined;
  imageUrl: string | null;
  creationDate: string | null;
  refund: RefundInfo | undefined;
};

// ============================================================
// CONFIGURATION
// ============================================================

const ORDER_HISTORY_DAYS = 365;

const ORDERS_PAGE_SIZE = 200;
const MAX_ORDER_PAGES = 100;

const FINANCES_PAGE_SIZE = 100;
const MAX_FINANCES_PAGES = 100;

// ============================================================
// MONEY HELPERS
// ============================================================

function parseMoney(value?: Money): number | null {
  if (!value || value.currency !== "USD") {
    return null;
  }

  if (
    typeof value.value !== "string" ||
    !/^-?\d+(\.\d{1,2})?$/.test(value.value)
  ) {
    return null;
  }

  const cents = Math.round(Number(value.value) * 100);

  return Number.isSafeInteger(cents) ? cents : null;
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function getRefundStatus(
  saleCents: number,
  refundCents: number
): "REFUNDED" | "PARTIALLY_REFUNDED" | "COST_NEEDED" {
  if (refundCents <= 0) {
    return "COST_NEEDED";
  }

  if (refundCents >= saleCents - 1) {
    return "REFUNDED";
  }

  return "PARTIALLY_REFUNDED";
}

// ============================================================
// IMAGE HELPERS
// ============================================================

function validImageUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return null;
    }

    const hostname = url.hostname.toLowerCase();

    if (
      hostname !== "ebayimg.com" &&
      !hostname.endsWith(".ebayimg.com")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function getApplicationToken(
  ebayApiBase: string
): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  try {
    const response = await fetch(
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

    if (!response.ok) {
      console.error(
        "Unable to obtain eBay application token:",
        response.status
      );

      return null;
    }

    const data: EbayTokenResponse = await response.json();

    return data.access_token ?? null;
  } catch (error) {
    console.error(
      "Error obtaining eBay application token:",
      error
    );

    return null;
  }
}

async function getListingImage(
  ebayApiBase: string,
  applicationToken: string,
  lineItem: EbayLineItem
): Promise<string | null> {
  const directImage = validImageUrl(
    lineItem.image?.imageUrl
  );

  if (directImage) {
    return directImage;
  }

  if (!lineItem.legacyItemId) {
    return null;
  }

  const params = new URLSearchParams({
    legacy_item_id: lineItem.legacyItemId,
  });

  if (lineItem.legacyVariationId) {
    params.set(
      "legacy_variation_id",
      lineItem.legacyVariationId
    );
  } else if (lineItem.sku) {
    params.set("legacy_variation_sku", lineItem.sku);
  }

  try {
    const response = await fetch(
      `${ebayApiBase}/buy/browse/v1/item/get_item_by_legacy_id?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${applicationToken}`,
          Accept: "application/json",
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.warn(
        "eBay listing image unavailable:",
        lineItem.legacyItemId,
        response.status
      );

      return null;
    }

    const item: EbayBrowseItem = await response.json();

    return validImageUrl(item.image?.imageUrl);
  } catch (error) {
    console.error(
      "Error retrieving eBay listing image:",
      error
    );

    return null;
  }
}

async function getOrderImage(
  ebayApiBase: string,
  applicationToken: string | null,
  order: EbayOrder,
  imageCache: Map<string, string | null>
): Promise<string | null> {
  for (const lineItem of order.lineItems ?? []) {
    const directImage = validImageUrl(
      lineItem.image?.imageUrl
    );

    if (directImage) {
      return directImage;
    }

    if (!lineItem.legacyItemId || !applicationToken) {
      continue;
    }

    const cacheKey = [
      lineItem.legacyItemId,
      lineItem.legacyVariationId ?? "",
      lineItem.sku ?? "",
    ].join(":");

    if (imageCache.has(cacheKey)) {
      const cached = imageCache.get(cacheKey);

      if (cached) {
        return cached;
      }

      continue;
    }

    const imageUrl = await getListingImage(
      ebayApiBase,
      applicationToken,
      lineItem
    );

    imageCache.set(cacheKey, imageUrl);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

// ============================================================
// ACCOUNT DELETION PROTECTION
// ============================================================

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

// ============================================================
// HISTORICAL ORDER RETRIEVAL
// ============================================================

async function getHistoricalOrders(
  ebayApiBase: string,
  accessToken: string
): Promise<EbayOrder[]> {
  const now = new Date();

  const historyStart = new Date(
    now.getTime() -
      ORDER_HISTORY_DAYS * 24 * 60 * 60 * 1000
  );

  const creationDateFilter =
    `creationdate:[${historyStart.toISOString()}..${now.toISOString()}]`;

  const ebayOrders: EbayOrder[] = [];
  const seenOrderIds = new Set<string>();

  let offset = 0;
  let complete = false;

  for (
    let page = 0;
    page < MAX_ORDER_PAGES;
    page++
  ) {
    const params = new URLSearchParams({
      filter: creationDateFilter,
      limit: String(ORDERS_PAGE_SIZE),
      offset: String(offset),
    });

    const response = await fetch(
      `${ebayApiBase}/sell/fulfillment/v1/order?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const responseText = await response.text();

      console.error(
        "Historical eBay orders request failed:",
        {
          status: response.status,
          page,
          offset,
          response: responseText.slice(0, 1000),
        }
      );

      throw new Error(
        `eBay historical orders request failed (HTTP ${response.status}).`
      );
    }

    const data: EbayOrdersResponse =
      await response.json();

    const pageOrders = data.orders ?? [];

    for (const order of pageOrders) {
      if (
        order.orderId &&
        !seenOrderIds.has(order.orderId)
      ) {
        seenOrderIds.add(order.orderId);
        ebayOrders.push(order);
      }
    }

    offset += pageOrders.length;

    console.log("ProfitSync order history page:", {
      page: page + 1,
      retrieved: pageOrders.length,
      totalImportedFromApi: ebayOrders.length,
      reportedTotal: data.total,
    });

    if (
      pageOrders.length === 0 ||
      pageOrders.length < ORDERS_PAGE_SIZE ||
      (
        typeof data.total === "number" &&
        offset >= data.total
      )
    ) {
      complete = true;
      break;
    }
  }

  if (!complete) {
    throw new Error(
      "Historical order pagination limit reached."
    );
  }

  return ebayOrders;
}

// ============================================================
// FINANCIAL TRANSACTIONS
//
// Retrieves:
// 1. SALE transactions for seller fees
// 2. REFUND transactions for refunded amounts
//
// Refunds are stored separately from seller fees.
// ============================================================

async function getFinancialTransactions(
  ebayFinancesBase: string,
  accessToken: string,
  transactionType: "SALE" | "REFUND"
): Promise<EbayTransaction[]> {
  const transactions: EbayTransaction[] = [];
  const seenTransactions = new Set<string>();

  let offset = 0;
  let complete = false;

  for (
    let page = 0;
    page < MAX_FINANCES_PAGES;
    page++
  ) {
    const params = new URLSearchParams({
      filter: `transactionType:{${transactionType}}`,
      limit: String(FINANCES_PAGE_SIZE),
      offset: String(offset),
    });

    const response = await fetch(
      `${ebayFinancesBase}/sell/finances/v1/transaction?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (response.status === 204) {
      complete = true;
      break;
    }

    if (!response.ok) {
      const responseText = await response.text();

      console.error(
        `eBay ${transactionType} transactions request failed:`,
        {
          status: response.status,
          response: responseText.slice(0, 1000),
        }
      );

      throw new Error(
        `Unable to retrieve eBay ${transactionType} transactions (HTTP ${response.status}).`
      );
    }

    const data: EbayTransactionsResponse =
      await response.json();

    const pageTransactions = data.transactions ?? [];

    for (const transaction of pageTransactions) {
      if (
        transaction.transactionType !== transactionType ||
        !transaction.orderId ||
        !transaction.transactionId
      ) {
        continue;
      }

      if (
        seenTransactions.has(transaction.transactionId)
      ) {
        continue;
      }

      seenTransactions.add(transaction.transactionId);
      transactions.push(transaction);
    }

    offset += pageTransactions.length;

    if (
      pageTransactions.length === 0 ||
      pageTransactions.length < FINANCES_PAGE_SIZE ||
      (
        typeof data.total === "number" &&
        offset >= data.total
      )
    ) {
      complete = true;
      break;
    }
  }

  if (!complete) {
    throw new Error(
      `eBay ${transactionType} pagination limit reached.`
    );
  }

  return transactions;
}

async function getFinancialData(
  ebayFinancesBase: string,
  accessToken: string
): Promise<FinancialData> {
  const feesByOrder = new Map<string, number>();
  const refundsByOrder = new Map<string, RefundInfo>();

  // --------------------------------------------
  // Retrieve SALE transactions
  // --------------------------------------------

  const sales = await getFinancialTransactions(
    ebayFinancesBase,
    accessToken,
    "SALE"
  );

  for (const transaction of sales) {
    if (!transaction.orderId) {
      continue;
    }

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

  // --------------------------------------------
  // Retrieve REFUND transactions
  // --------------------------------------------

  const refunds = await getFinancialTransactions(
    ebayFinancesBase,
    accessToken,
    "REFUND"
  );

  for (const transaction of refunds) {
    if (!transaction.orderId) {
      continue;
    }

    const parsedAmount = parseMoney(
      transaction.amount
    );

    if (parsedAmount === null) {
      console.warn(
        "Skipping refund with unavailable amount:",
        transaction.transactionId
      );

      continue;
    }

    // eBay refund transactions may represent
    // outgoing money with a negative value.
    const refundCents = Math.abs(parsedAmount);

    if (refundCents <= 0) {
      continue;
    }

    const previous = refundsByOrder.get(
      transaction.orderId
    );

    const previousAmount =
      previous?.amountCents ?? 0;

    let refundedAt =
      previous?.refundedAt ?? null;

    if (transaction.transactionDate) {
      const date = new Date(
        transaction.transactionDate
      );

      if (!Number.isNaN(date.getTime())) {
        const currentDate = date.toISOString();

        if (
          !refundedAt ||
          currentDate > refundedAt
        ) {
          refundedAt = currentDate;
        }
      }
    }

    refundsByOrder.set(
      transaction.orderId,
      {
        amountCents:
          previousAmount + refundCents,
        refundedAt,
      }
    );
  }

  console.log("ProfitSync financial data:", {
    saleTransactions: sales.length,
    refundTransactions: refunds.length,
    ordersWithFees: feesByOrder.size,
    ordersWithRefunds: refundsByOrder.size,
  });

  return {
    feesByOrder,
    refundsByOrder,
  };
}

// ============================================================
// DATABASE HELPERS
// ============================================================

async function insertOrder(
  client: PoolClient,
  order: PreparedOrder,
  userId: string,
  ebayUserId: string,
  environment: string
): Promise<void> {
  const refundCents =
    order.refund?.amountCents ?? 0;

  const status = getRefundStatus(
    order.saleCents,
    refundCents
  );

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
        "imageUrl",
        status,
        "refundAmount",
        "refundedAt",
        "orderDate",
        "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13,
        COALESCE($14::timestamptz, NOW()),
        NOW()
      )
    `,
    [
      userId,
      order.orderId,
      ebayUserId,
      order.buyerId,
      environment,
      order.item,
      formatMoney(order.saleCents),
      order.feeCents !== undefined
        ? formatMoney(order.feeCents)
        : "0.00",
      null,
      order.imageUrl,
      status,
      formatMoney(refundCents),
      order.refund?.refundedAt ?? null,
      order.creationDate,
    ]
  );
}

async function updateExistingOrder(
  client: PoolClient,
  order: ExistingOrder,
  userId: string,
  ebayUserId: string,
  environment: string,
  feeCents: number | undefined,
  imageUrl: string | null,
  refund: RefundInfo | undefined
): Promise<boolean> {
  const result = await client.query(
    `
      UPDATE public."order"
      SET
        "ebayFees" = COALESCE(
          $1::numeric,
          "ebayFees"
        ),

        "imageUrl" = COALESCE(
          "imageUrl",
          $2::text
        ),

        "refundAmount" = CASE
          WHEN $3::numeric IS NOT NULL
          THEN GREATEST(
            COALESCE("refundAmount", 0),
            $3::numeric
          )
          ELSE "refundAmount"
        END,

        "refundedAt" = CASE
          WHEN $3::numeric IS NOT NULL
          THEN COALESCE(
            $4::timestamptz,
            "refundedAt"
          )
          ELSE "refundedAt"
        END,

        status = CASE
          WHEN $3::numeric IS NOT NULL
            AND $3::numeric >= "salePrice" - 0.01
          THEN 'REFUNDED'

          WHEN $3::numeric IS NOT NULL
            AND $3::numeric > 0
            AND status <> 'REFUNDED'
          THEN 'PARTIALLY_REFUNDED'

          ELSE status
        END,

        "updatedAt" = NOW()

      WHERE id = $5
        AND "userId" = $6
        AND "ebayUserId" = $7
        AND environment = $8
        AND "ebayOrderId" = $9
        AND "ebayBuyerId" = $10

        AND (
          (
            $1::numeric IS NOT NULL
            AND "ebayFees" IS DISTINCT FROM $1::numeric
          )
          OR (
            "imageUrl" IS NULL
            AND $2::text IS NOT NULL
          )
          OR (
            $3::numeric IS NOT NULL
            AND (
              COALESCE("refundAmount", 0) < $3::numeric
              OR (
                $3::numeric >= "salePrice" - 0.01
                AND status <> 'REFUNDED'
              )
              OR (
                $3::numeric > 0
                AND $3::numeric < "salePrice" - 0.01
                AND status NOT IN (
                  'REFUNDED',
                  'PARTIALLY_REFUNDED'
                )
              )
            )
          )
        )

      RETURNING id
    `,
    [
      feeCents !== undefined
        ? formatMoney(feeCents)
        : null,
      imageUrl,
      refund
        ? formatMoney(refund.amountCents)
        : null,
      refund?.refundedAt ?? null,
      order.id,
      userId,
      ebayUserId,
      environment,
      order.ebayOrderId,
      order.ebayBuyerId,
    ]
  );

  return Boolean(result.rowCount);
}

// ============================================================
// MAIN SYNC ROUTE
// ============================================================

export async function POST() {
  try {
    // --------------------------------------------------------
    // STEP 1: Authenticate ProfitSync user
    // --------------------------------------------------------

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const userId = user.id;

    // --------------------------------------------------------
    // STEP 2: Determine eBay environment
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // STEP 3: Verify configuration
    // --------------------------------------------------------

    const hashSecret =
      process.env.EBAY_DELETION_HASH_SECRET;

    const databaseUrl =
      process.env.DATABASE_URL;

    if (!hashSecret || !databaseUrl) {
      console.error(
        "Missing order sync configuration."
      );

      return NextResponse.json(
        {
          error:
            "Order sync protection unavailable.",
        },
        { status: 503 }
      );
    }

    // --------------------------------------------------------
    // STEP 4: Retrieve connected eBay account
    // --------------------------------------------------------

    const connections =
      await db.orm.public.EbayConnection.where({
        userId,
        environment,
      }).all();

    const identifiedConnections =
      connections.filter(
        (connection) =>
          Boolean(connection.ebayUserId)
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
          error:
            "Multiple eBay accounts connected.",
          message:
            "Account selection must be configured before syncing.",
        },
        { status: 409 }
      );
    }

    const connection =
      identifiedConnections[0];

    const ebayUserId =
      connection.ebayUserId;

    if (!ebayUserId) {
      return NextResponse.json(
        {
          error:
            "Connected eBay account has no user ID.",
        },
        { status: 401 }
      );
    }

    let accessToken =
      connection.accessToken;

    // --------------------------------------------------------
    // STEP 5: Refresh access token if expired
    // --------------------------------------------------------

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
            error:
              "eBay refresh token expired.",
            message:
              "Please reconnect your eBay account.",
          },
          { status: 401 }
        );
      }

      const clientId =
        process.env.EBAY_CLIENT_ID;

      const clientSecret =
        process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          {
            error:
              "Missing eBay API credentials.",
          },
          { status: 500 }
        );
      }

      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64");

      const scopes = [
        "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
        "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
        "https://api.ebay.com/oauth/api_scope/sell.finances",
      ];

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token:
          connection.refreshToken,
        scope: scopes.join(" "),
      });

      const tokenResponse = await fetch(
        `${ebayApiBase}/identity/v1/oauth2/token`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            Authorization:
              `Basic ${credentials}`,
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
        console.error(
          "eBay token refresh failed:",
          {
            status: tokenResponse.status,
            error: tokenData.error,
            description:
              tokenData.error_description,
          }
        );

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

      accessToken =
        tokenData.access_token;

      const newExpiration = new Date(
        Date.now() +
          tokenData.expires_in * 1000
      ).toISOString();

      await db.orm.public.EbayConnection.where({
        id: connection.id,
        userId,
      }).update({
        accessToken,
        accessTokenExpiresAt:
          newExpiration,
      });
    }

    // --------------------------------------------------------
    // STEP 6: Retrieve historical eBay orders
    // --------------------------------------------------------

    const ebayOrders =
      await getHistoricalOrders(
        ebayApiBase,
        accessToken
      );

    console.log(
      "ProfitSync historical orders found:",
      ebayOrders.length
    );

    // --------------------------------------------------------
    // STEP 7: Retrieve fees and refunds
    // --------------------------------------------------------

    const financialData =
      await getFinancialData(
        ebayFinancesBase,
        accessToken
      );

    const {
      feesByOrder,
      refundsByOrder,
    } = financialData;

    // --------------------------------------------------------
    // STEP 8: Retrieve existing ProfitSync orders
    // --------------------------------------------------------

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
          (id): id is string =>
            id !== null
        )
    );

    const existingByEbayId = new Map(
      existingOrders
        .filter((order) =>
          Boolean(order.ebayOrderId)
        )
        .map((order) => [
          order.ebayOrderId,
          order,
        ])
    );

    // --------------------------------------------------------
    // STEP 9: Retrieve missing listing images
    // --------------------------------------------------------

    const ordersNeedingImages =
      ebayOrders.filter((order) => {
        const existing =
          existingByEbayId.get(
            order.orderId
          );

        return (
          !existing ||
          !existing.imageUrl
        );
      });

    const needsApplicationToken =
      ordersNeedingImages.some((order) =>
        order.lineItems?.some(
          (lineItem) =>
            Boolean(lineItem.legacyItemId) &&
            !validImageUrl(
              lineItem.image?.imageUrl
            )
        )
      );

    const applicationToken =
      needsApplicationToken
        ? await getApplicationToken(
            ebayApiBase
          )
        : null;

    const imageCache =
      new Map<string, string | null>();

    const imagesByOrder =
      new Map<string, string>();

    for (const order of ordersNeedingImages) {
      const imageUrl =
        await getOrderImage(
          ebayApiBase,
          applicationToken,
          order,
          imageCache
        );

      if (imageUrl) {
        imagesByOrder.set(
          order.orderId,
          imageUrl
        );
      }
    }

    // --------------------------------------------------------
    // STEP 10: Prepare counters
    // --------------------------------------------------------

    let imported = 0;
    let skipped = 0;

    let feesUpdated = 0;
    let feesUnavailable = 0;

    let imagesImported = 0;
    let imagesUpdated = 0;

    let refundedImported = 0;
    let refundsUpdated = 0;

    let fullyRefunded = 0;
    let partiallyRefunded = 0;

    // --------------------------------------------------------
    // STEP 11: Connect to PostgreSQL
    // --------------------------------------------------------

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      const client =
        await pool.connect();

      try {
        // ====================================================
        // IMPORT NEW ORDERS
        // ====================================================

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

          const totalCents =
            parseMoney(
              ebayOrder.pricingSummary?.total
            );

          if (totalCents === null) {
            skipped++;
            continue;
          }

          const item =
            ebayOrder.lineItems
              ?.map((lineItem) =>
                lineItem.title
              )
              .filter(Boolean)
              .join(", ") ||
            "eBay Order";

          const feeCents =
            feesByOrder.get(
              ebayOrder.orderId
            );

          const refund =
            refundsByOrder.get(
              ebayOrder.orderId
            );

          const imageUrl =
            imagesByOrder.get(
              ebayOrder.orderId
            ) ?? null;

          const preparedOrder: PreparedOrder = {
            orderId: ebayOrder.orderId,
            buyerId,
            item,
            saleCents: totalCents,
            feeCents,
            imageUrl,
            creationDate:
              ebayOrder.creationDate ?? null,
            refund,
          };

          let transactionStarted = false;

          try {
            await client.query("BEGIN");
            transactionStarted = true;

            // Respect account deletion requests.

            const deleted =
              await lockAndCheckIdentifiers(
                client,
                environment,
                [
                  ebayUserId,
                  buyerId,
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

            // Prevent duplicate imports.

            const duplicate =
              await client.query(
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

            // Insert order and refund information.

            await insertOrder(
              client,
              preparedOrder,
              userId,
              ebayUserId,
              environment
            );

            await client.query("COMMIT");
            transactionStarted = false;

            existingIds.add(
              ebayOrder.orderId
            );

            imported++;

            if (imageUrl) {
              imagesImported++;
            }

            if (feeCents === undefined) {
              feesUnavailable++;
            }

            if (refund && refund.amountCents > 0) {
              refundedImported++;

              const status = getRefundStatus(
                totalCents,
                refund.amountCents
              );

              if (status === "REFUNDED") {
                fullyRefunded++;
              } else {
                partiallyRefunded++;
              }
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

        // ====================================================
        // UPDATE EXISTING ORDERS
        //
        // Preserve:
        // - Saved product costs
        // - Original sale prices
        // - Order dates
        //
        // Update:
        // - Seller fees
        // - Missing images
        // - Refund amounts
        // - Refund dates
        // - Refund statuses
        // ====================================================

        for (const order of existingOrders) {
          if (!order.ebayOrderId) {
            continue;
          }

          const feeCents =
            feesByOrder.get(
              order.ebayOrderId
            );

          const imageUrl =
            imagesByOrder.get(
              order.ebayOrderId
            ) ?? null;

          const refund =
            refundsByOrder.get(
              order.ebayOrderId
            );

          if (
            feeCents === undefined &&
            !imageUrl &&
            !refund
          ) {
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

            const updated =
              await updateExistingOrder(
                client,
                order,
                userId,
                ebayUserId,
                environment,
                feeCents,
                imageUrl,
                refund
              );

            await client.query("COMMIT");
            transactionStarted = false;

            if (updated) {
              if (
                feeCents !== undefined &&
                Number(order.ebayFees) !==
                  feeCents / 100
              ) {
                feesUpdated++;
              }

              if (
                imageUrl &&
                !order.imageUrl
              ) {
                imagesUpdated++;
              }

              if (
                refund &&
                refund.amountCents > 0
              ) {
                refundsUpdated++;
              }
            }

            if (feeCents === undefined) {
              feesUnavailable++;
            }
          } catch (error) {
            if (transactionStarted) {
              try {
                await client.query("ROLLBACK");
              } catch (rollbackError) {
                console.error(
                  "Order update rollback failed:",
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

    // ========================================================
    // SYNC COMPLETE
    // ========================================================

    return NextResponse.json({
      success: true,
      environment,

      historyDays: ORDER_HISTORY_DAYS,

      found: ebayOrders.length,
      imported,
      skipped,

      feesUpdated,
      feesUnavailable,

      imagesImported,
      imagesUpdated,

      refundedImported,
      refundsUpdated,

      fullyRefunded,
      partiallyRefunded,

      financialOrdersMatched:
        feesByOrder.size,

      refundedOrdersMatched:
        refundsByOrder.size,

      message:
        `Found ${ebayOrders.length} eBay orders ` +
        `from the past ${ORDER_HISTORY_DAYS} days. ` +
        `Imported ${imported} new orders. ` +
        `Updated fees on ${feesUpdated} existing orders. ` +
        `Added ${imagesImported + imagesUpdated} listing images. ` +
        `Imported ${refundedImported} orders with refunds. ` +
        `Updated ${refundsUpdated} existing orders with refund information.`,
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
        message:
          error instanceof Error
            ? error.message
            : "Unknown synchronization error.",
      },
      { status: 500 }
    );
  }
}