
import { NextResponse } from "next/server";
import { db } from "@/prisma/db";

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type EbayOrder = {
  orderId: string;
  creationDate?: string;
  orderPaymentStatus?: string;
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

export async function POST() {
  try {
    // STEP 1: Determine which eBay environment to use.
    const environment =
      process.env.EBAY_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX";

    const ebayApiBase =
      environment === "PRODUCTION"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

    // STEP 2: Find the connected eBay account.
    const connections =
      await db.orm.public.EbayConnection.all();

    const matchingConnections = connections.filter(
      (connection) =>
        connection.environment === environment &&
        Boolean(connection.ebayUserId)
    );

    if (matchingConnections.length === 0) {
      return NextResponse.json(
        {
          error: "No identified eBay account connected.",
          message:
            "Please reconnect your eBay account before syncing orders.",
        },
        { status: 401 }
      );
    }

    // Never silently choose between multiple seller accounts.
    if (matchingConnections.length > 1) {
      return NextResponse.json(
        {
          error: "Multiple eBay accounts connected.",
          message:
            "Account selection must be configured before syncing.",
        },
        { status: 409 }
      );
    }

    const connection = matchingConnections[0];
    const ebayUserId = connection.ebayUserId;

    if (!ebayUserId) {
      return NextResponse.json(
        { error: "Connected eBay account has no user ID." },
        { status: 401 }
      );
    }

    let accessToken = connection.accessToken;

    // STEP 3: Check the access token expiration.
    const accessTokenExpiresAt = new Date(
      connection.accessTokenExpiresAt
    ).getTime();

    if (
      !Number.isFinite(accessTokenExpiresAt) ||
      accessTokenExpiresAt <= Date.now() + 60_000
    ) {
      // STEP 4: Verify the refresh token is still valid.
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

      // STEP 5: Prepare the token refresh request.
      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64");

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        scope:
          "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
      });

      // STEP 6: Request a new access token.
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
            message:
              "Please reconnect your eBay account if needed.",
          },
          { status: 401 }
        );
      }

      accessToken = tokenData.access_token;

      const newExpiration = new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString();

      // STEP 7: Save the refreshed token.
      await db.orm.public.EbayConnection
        .where({ id: connection.id })
        .update({
          accessToken,
          accessTokenExpiresAt: newExpiration,
        });

      console.log(
        `eBay ${environment} access token refreshed successfully.`
      );
    }

    // STEP 8: Retrieve orders from the correct eBay API.
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
      console.error(
        "eBay orders request failed:",
        response.status
      );

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

    // STEP 9: Retrieve existing ProfitSync orders.
    const existingOrders =
      await db.orm.public.Order.all();

    const existingIds = new Set(
      existingOrders
        .map((order) => order.ebayOrderId)
        .filter((id): id is string => id !== null)
    );

    let imported = 0;
    let skipped = 0;

    // STEP 10: Import new eBay orders.
    for (const ebayOrder of ebayOrders) {
      if (!ebayOrder.orderId) {
        skipped++;
        continue;
      }

      // Prevent importing the same order twice.
      if (existingIds.has(ebayOrder.orderId)) {
        skipped++;
        continue;
      }

      const total =
        ebayOrder.pricingSummary?.total?.value;

      if (
        !total ||
        !Number.isFinite(Number(total)) ||
        Number(total) < 0
      ) {
        skipped++;
        continue;
      }

      // Combine the titles of items in the order.
      const item =
        ebayOrder.lineItems
          ?.map((lineItem) => lineItem.title)
          .filter(Boolean)
          .join(", ") || "eBay Order";

      // STEP 11: Save the order with its seller ID.
      await db.orm.public.Order.create({
        ebayOrderId: ebayOrder.orderId,
        ebayUserId,
        item,
        salePrice: Number(total).toFixed(2),

        // Actual eBay seller fees will be added later.
        ebayFees: "0.00",

        // Product cost is entered manually.
        productCost: null,

        status: "COST_NEEDED",

        ...(ebayOrder.creationDate
          ? { orderDate: ebayOrder.creationDate }
          : {}),
      });

      existingIds.add(ebayOrder.orderId);
      imported++;
    }

    // STEP 12: Return the sync results.
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
