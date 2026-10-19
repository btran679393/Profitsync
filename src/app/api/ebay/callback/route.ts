
import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  try {
    // Determine which eBay environment we're using.
    const environment =
      process.env.EBAY_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX";

    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const ruName = process.env.EBAY_RUNAME;

    const ebayApiBase =
      environment === "PRODUCTION"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

    // Check that all required environment variables exist.
    if (!clientId || !clientSecret || !ruName) {
      return NextResponse.json(
        { error: "Missing eBay OAuth configuration" },
        { status: 500 }
      );
    }

    // Retrieve the authorization code and state from eBay.
    const code = request.nextUrl.searchParams.get("code");
    const returnedState = request.nextUrl.searchParams.get("state");

    // Retrieve the state saved when authorization began.
    const savedState =
      request.cookies.get("ebay_oauth_state")?.value;

    // Reject requests with missing or mismatched state values.
    if (
      !returnedState ||
      !savedState ||
      returnedState !== savedState
    ) {
      return NextResponse.json(
        { error: "Invalid or expired eBay authorization state" },
        { status: 403 }
      );
    }

    // Check that eBay returned an authorization code.
    if (!code) {
      return NextResponse.json(
        { error: "eBay did not return an authorization code" },
        { status: 400 }
      );
    }

    // Encode the Client ID and Client Secret for authentication.
    const credentials = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString("base64");

    // Prepare the authorization code exchange.
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ruName,
    });

    // Exchange the authorization code for access and refresh tokens.
    const response = await fetch(
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
      await response.json();

    // Handle errors returned by eBay.
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

    // Verify that eBay returned all required token information.
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

    // Calculate token expiration dates.
    const accessTokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const refreshTokenExpiresAt = new Date(
      Date.now() +
        tokenData.refresh_token_expires_in * 1000
    ).toISOString();

    // Retrieve existing eBay connections.
    const existingConnections =
      await db.orm.public.EbayConnection.all();

    // Find the connection for the current environment.
    const existingConnection = existingConnections.find(
      (connection) => connection.environment === environment
    );

    if (existingConnection) {
      // Update the existing Sandbox or Production connection.
      await db.orm.public.EbayConnection
        .where({ id: existingConnection.id })
        .update({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
          environment,
        });
    } else {
      // Create a new connection for this environment.
      await db.orm.public.EbayConnection.create({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        environment,
      });
    }

    console.log(
      `eBay ${environment} account connected and tokens saved successfully.`
    );

    // Return a success message without exposing tokens.
    const successResponse = NextResponse.json({
      success: true,
      message: `eBay ${environment} account connected successfully.`,
      environment,
      accessTokenExpiresIn: tokenData.expires_in,
      refreshTokenExpiresIn:
        tokenData.refresh_token_expires_in,
    });

    // Remove the OAuth state cookie after successful authorization.
    successResponse.cookies.delete("ebay_oauth_state");

    return successResponse;
  } catch (error) {
    console.error("eBay OAuth callback error:", error);

    return NextResponse.json(
      {
        error: "Something went wrong while connecting eBay",
      },
      { status: 500 }
    );
  }
}
