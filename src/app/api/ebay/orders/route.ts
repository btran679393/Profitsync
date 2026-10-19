
import { NextResponse } from "next/server";
import { db } from "@/prisma/db";

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function GET() {
  try {
    const connections = await db.orm.public.EbayConnection.all();

    if (connections.length === 0) {
      return NextResponse.json(
        { error: "No eBay account connected." },
        { status: 401 }
      );
    }

    const connection = connections[0];
    let accessToken = connection.accessToken;

    // Refresh the token if it has expired or is about to expire
    const expiresAt = new Date(
      connection.accessTokenExpiresAt
    ).getTime();

    if (expiresAt <= Date.now() + 60_000) {
      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret = process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Missing eBay API credentials." },
          { status: 500 }
        );
      }

      const refreshTokenExpiresAt = new Date(
        connection.refreshTokenExpiresAt
      ).getTime();

      if (refreshTokenExpiresAt <= Date.now()) {
        return NextResponse.json(
          {
            error: "eBay refresh token expired.",
            message: "Please reconnect your eBay account.",
          },
          { status: 401 }
        );
      }

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
            message: "Please reconnect your eBay account if needed.",
          },
          { status: 401 }
        );
      }

      accessToken = tokenData.access_token;

      const newExpiration = new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString();

      // Save the refreshed access token in Supabase
      await db.orm.public.EbayConnection
        .where({ id: connection.id })
        .update({
          accessToken,
          accessTokenExpiresAt: newExpiration,
        });
    }

    // Retrieve orders using the valid access token
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

    const data = await response.json();

    return NextResponse.json({
      success: true,
      total: data.total ?? 0,
      orders: data.orders ?? [],
    });
  } catch (error) {
    console.error("Failed to fetch eBay orders:", error);

    return NextResponse.json(
      {
        error: "Something went wrong retrieving eBay orders.",
      },
      { status: 500 }
    );
  }
}
