import { NextResponse } from "next/server";
import { db } from "@/prisma/db";

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request) {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const ruName = process.env.EBAY_RUNAME;

    if (!clientId || !clientSecret || !ruName) {
      return NextResponse.json(
        { error: "Missing eBay OAuth configuration" },
        { status: 500 }
      );
    }

    // Get the authorization code eBay sent back to us.
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "eBay did not return an authorization code" },
        { status: 400 }
      );
    }

    // eBay requires the Client ID and Client Secret
    // to be sent using HTTP Basic authentication.
    const credentials = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ruName,
    });

    // Exchange the authorization code for eBay tokens.
    const response = await fetch(
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

    const tokenData: EbayTokenResponse = await response.json();

    if (!response.ok) {
      console.error("eBay token exchange failed:", {
        status: response.status,
        error: tokenData.error,
        description: tokenData.error_description,
      });

      return NextResponse.json(
        {
          error: "Failed to connect eBay account",
          details:
            tokenData.error_description ||
            tokenData.error ||
            "Unknown eBay OAuth error",
        },
        { status: response.status }
      );
    }

    if (
      !tokenData.access_token ||
      !tokenData.refresh_token ||
      !tokenData.expires_in ||
      !tokenData.refresh_token_expires_in
    ) {
      return NextResponse.json(
        { error: "eBay did not return the expected tokens" },
        { status: 500 }
      );
    }

    // Calculate the exact expiration dates.
    const accessTokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const refreshTokenExpiresAt = new Date(
      Date.now() + tokenData.refresh_token_expires_in * 1000
    ).toISOString();

    // Check whether an eBay connection already exists.
    const existingConnections =
      await db.orm.public.EbayConnection.all();

    if (existingConnections.length > 0) {
      // For our current single-user MVP, update the existing connection
      // instead of creating duplicate rows.
      await db.orm.public.EbayConnection
        .where({ id: existingConnections[0].id })
        .update({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
        });
    } else {
      // First eBay connection: create a new database row.
      await db.orm.public.EbayConnection.create({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      });
    }

    console.log("eBay account connected and tokens saved successfully.");

    // Never return the actual tokens to the browser.
    return NextResponse.json({
      success: true,
      message: "eBay account connected successfully.",
      accessTokenExpiresIn: tokenData.expires_in,
      refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
    });
  } catch (error) {
    console.error("eBay OAuth callback error:", error);

    return NextResponse.json(
      { error: "Something went wrong while connecting eBay" },
      { status: 500 }
    );
  }
}