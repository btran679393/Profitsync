
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

type EbayUserResponse = {
  userId?: string;
};

export async function GET(request: NextRequest) {
  try {
    // STEP 1: Determine the eBay environment.
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

    if (!clientId || !clientSecret || !ruName) {
      return NextResponse.json(
        { error: "Missing eBay OAuth configuration" },
        { status: 500 }
      );
    }

    // STEP 2: Verify the OAuth state.
    const code = request.nextUrl.searchParams.get("code");
    const returnedState =
      request.nextUrl.searchParams.get("state");

    const savedState =
      request.cookies.get("ebay_oauth_state")?.value;

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

    if (!code) {
      return NextResponse.json(
        { error: "eBay did not return an authorization code" },
        { status: 400 }
      );
    }

    // STEP 3: Exchange the authorization code for tokens.
    const credentials = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: ruName,
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
      !tokenData.refresh_token ||
      !tokenData.expires_in ||
      !tokenData.refresh_token_expires_in
    ) {
      console.error("eBay token exchange failed:", {
        status: tokenResponse.status,
        error: tokenData.error,
        description: tokenData.error_description,
      });

      return NextResponse.json(
        {
          error: "Failed to connect eBay account",
          details:
            tokenData.error_description ||
            tokenData.error ||
            "Missing token information",
        },
        { status: 502 }
      );
    }

    // STEP 4: Retrieve the connected eBay user's ID.
    const userResponse = await fetch(
      `${ebayApiBase}/commerce/identity/v1/user/`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!userResponse.ok) {
      console.error(
        "Failed to retrieve eBay user identity:",
        userResponse.status
      );

      return NextResponse.json(
        {
          error: "eBay connected, but user identity lookup failed.",
          status: userResponse.status,
        },
        { status: 502 }
      );
    }

    const userData: EbayUserResponse =
      await userResponse.json();

    if (!userData.userId) {
      return NextResponse.json(
        { error: "eBay did not return a user ID." },
        { status: 502 }
      );
    }

    const ebayUserId = userData.userId;

    // STEP 5: Calculate token expiration dates.
    const accessTokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const refreshTokenExpiresAt = new Date(
      Date.now() +
        tokenData.refresh_token_expires_in * 1000
    ).toISOString();

    // STEP 6: Find the existing account connection.
    const existingConnections =
      await db.orm.public.EbayConnection.all();

    const existingConnection = existingConnections.find(
      (connection) =>
        connection.environment === environment &&
        connection.ebayUserId === ebayUserId
    );

    // STEP 7: Save the account and its tokens.
    if (existingConnection) {
      await db.orm.public.EbayConnection
        .where({ id: existingConnection.id })
        .update({
          ebayUserId,
          environment,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          accessTokenExpiresAt,
          refreshTokenExpiresAt,
        });
    } else {
      await db.orm.public.EbayConnection.create({
        ebayUserId,
        environment,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      });
    }

    console.log(
      `eBay ${environment} account connected successfully.`
    );

    // STEP 8: Return success without exposing tokens.
    const successResponse = NextResponse.json({
      success: true,
      message: `eBay ${environment} account connected successfully.`,
      environment,
      ebayUserId,
      accessTokenExpiresIn: tokenData.expires_in,
      refreshTokenExpiresIn:
        tokenData.refresh_token_expires_in,
    });

    successResponse.cookies.delete("ebay_oauth_state");

    return successResponse;
  } catch (error) {
    console.error("eBay OAuth callback error:", error);

    return NextResponse.json(
      {
        error: "Something went wrong while connecting eBay.",
      },
      { status: 500 }
    );
  }
}
