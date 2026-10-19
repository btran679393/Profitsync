
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
    // STEP 1: Find the saved eBay connection
    const connections =
      await db.orm.public.EbayConnection.all();

    if (connections.length === 0) {
      return NextResponse.json(
        { error: "No eBay account connected." },
        { status: 401 }
      );
    }

    const connection = connections[0];

    let accessToken = connection.accessToken;

    // STEP 2: Check whether the access token is expiring
    const accessTokenExpiresAt = new Date(
      connection.accessTokenExpiresAt
    ).getTime();

    if (
      !Number.isFinite(accessTokenExpiresAt) ||
      accessTokenExpiresAt <= Date.now() + 60_000
    ) {
      // STEP 3: Check the refresh token
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

      // STEP 4: Prepare eBay authentication
      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64");

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        scope:
          "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
      });

      // STEP 5: Request a new access token
      const tokenResponse = await fetch(
        "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
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

      // STEP 6: Save the refreshed token in Supabase
      await db.orm.public.EbayConnection
        .where({ id: connection.id })
        .update({
          accessToken,
          accessTokenExpiresAt: newExpiration,
        });

      console.log("eBay access token refreshed successfully.");
    }

    // STEP 7: Retrieve orders from eBay Sandbox
    const response = await fetch(
      "https://api.sandbox.ebay.com/sell/fulfillment/v1/order?limit=20",
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

    // STEP 8: Retrieve existing ProfitSync orders
    const existingOrders =
      await db.orm.public.Order.all();

    const existingIds = new Set(
      existingOrders
        .map((order) => order.ebayOrderId)
        .filter((id): id is string => id !== null)
    );

    let imported = 0;
    let skipped = 0;

    // STEP 9: Import only new eBay orders
    for (const ebayOrder of ebayOrders) {
      if (!ebayOrder.orderId) {
        skipped++;
        continue;
      }

      // Prevent duplicate orders
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

      // Get item names from eBay
      const item =
        ebayOrder.lineItems
          ?.map((lineItem) => lineItem.title)
          .filter(Boolean)
          .join(", ") || "eBay Order";

      // STEP 10: Save the order to Supabase
      await db.orm.public.Order.create({
        ebayOrderId: ebayOrder.orderId,
        item,
        salePrice: Number(total).toFixed(2),

        // Actual seller fees will be added later
        ebayFees: "0.00",

        // User enters the product cost
        productCost: null,

        status: "COST_NEEDED",

        ...(ebayOrder.creationDate
          ? { orderDate: ebayOrder.creationDate }
          : {}),
      });

      existingIds.add(ebayOrder.orderId);

      imported++;
    }

    // STEP 11: Return the sync results
    return NextResponse.json({
      success: true,
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
