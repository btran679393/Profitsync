
import {
  createHmac,
  timingSafeEqual,
} from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Pool } from "pg";

type EbayTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

type EbayUserResponse = {
  userId?: string;
};

type ExistingConnection = {
  id: number;
  userId: string | null;
};

function safeEqual(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return (
    first.length === second.length &&
    timingSafeEqual(first, second)
  );
}

export async function GET(request: NextRequest) {
  // Clear the OAuth cookie after the callback.
  const respond = (
    body: Record<string, unknown>,
    status = 200
  ) => {
    const response = NextResponse.json(body, { status });

    response.cookies.delete("ebay_oauth_state");

    return response;
  };

  try {
    // STEP 1: Verify the signed-in Google user.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return respond(
        { error: "Please sign in to ProfitSync first." },
        401
      );
    }

    // STEP 2: Read the OAuth callback parameters.
    const code = request.nextUrl.searchParams.get("code");
    const returnedState =
      request.nextUrl.searchParams.get("state");

    const signedState =
      request.cookies.get("ebay_oauth_state")?.value;

    const stateSecret =
      process.env.EBAY_OAUTH_STATE_SECRET;

    if (!returnedState || !signedState || !stateSecret) {
      return respond(
        { error: "Missing or expired eBay authorization state." },
        403
      );
    }

    // STEP 3: Verify the signed OAuth state.
    const parts = signedState.split(".");

    if (parts.length !== 5) {
      return respond(
        { error: "Invalid eBay authorization state." },
        403
      );
    }

    const [
      savedState,
      savedUserId,
      savedEnvironment,
      expiresAtString,
      savedSignature,
    ] = parts;

    const payload = [
      savedState,
      savedUserId,
      savedEnvironment,
      expiresAtString,
    ].join(".");

    const expectedSignature = createHmac(
      "sha256",
      stateSecret
    )
      .update(payload)
      .digest("hex");

    if (!safeEqual(savedSignature, expectedSignature)) {
      return respond(
        { error: "Invalid eBay authorization signature." },
        403
      );
    }

    if (!safeEqual(returnedState, savedState)) {
      return respond(
        { error: "eBay authorization state does not match." },
        403
      );
    }

    // Verify that the same Google user completed OAuth.
    if (savedUserId !== user.id) {
      return respond(
        {
          error:
            "The signed-in ProfitSync account has changed. Please restart eBay authorization.",
        },
        403
      );
    }

    const expiresAt = Number(expiresAtString);

    if (
      !Number.isFinite(expiresAt) ||
      Date.now() >= expiresAt
    ) {
      return respond(
        { error: "eBay authorization has expired." },
        403
      );
    }

    // STEP 4: Confirm the environment hasn't changed.
    const environment =
      process.env.EBAY_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX";

    if (savedEnvironment !== environment) {
      return respond(
        { error: "eBay environment mismatch." },
        403
      );
    }

    if (!code) {
      return respond(
        { error: "eBay did not return an authorization code." },
        400
      );
    }

    // STEP 5: Load server configuration.
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const ruName = process.env.EBAY_RUNAME;
    const databaseUrl = process.env.DATABASE_URL;

    if (
      !clientId ||
      !clientSecret ||
      !ruName ||
      !databaseUrl
    ) {
      return respond(
        { error: "Missing server configuration." },
        500
      );
    }

    const ebayApiBase =
      environment === "PRODUCTION"
        ? "https://api.ebay.com"
        : "https://api.sandbox.ebay.com";

    // STEP 6: Exchange the code for eBay tokens.
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
      !tokenData.refresh_token ||
      !tokenData.expires_in ||
      !tokenData.refresh_token_expires_in
    ) {
      console.error("eBay token exchange failed:", {
        status: tokenResponse.status,
        error: tokenData.error,
      });

      return respond(
        { error: "Failed to connect eBay account." },
        502
      );
    }

    // STEP 7: Retrieve the verified eBay seller identity.
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

    // NEW: Log eBay's error details without exposing tokens.
    if (!userResponse.ok) {
      const errorBody = await userResponse.text();

      console.error("eBay seller identity request failed:", {
        status: userResponse.status,
        response: errorBody.slice(0, 2000),
      });

      return respond(
        { error: "Failed to retrieve eBay seller identity." },
        502
      );
    }

    const userData: EbayUserResponse =
      await userResponse.json();

    if (!userData.userId) {
      return respond(
        { error: "eBay did not return a seller ID." },
        502
      );
    }

    const ebayUserId = userData.userId;

    // STEP 8: Calculate token expiration dates.
    const accessTokenExpiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString();

    const refreshTokenExpiresAt = new Date(
      Date.now() +
        tokenData.refresh_token_expires_in * 1000
    ).toISOString();

    // STEP 9: Save the connection securely.
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
    });

    try {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Prevent concurrent connections for the same seller.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [environment, ebayUserId]
        );

        const result =
          await client.query<ExistingConnection>(
            `
              SELECT id, "userId"
              FROM public."ebayConnection"
              WHERE environment = $1
                AND "ebayUserId" = $2
              FOR UPDATE
            `,
            [environment, ebayUserId]
          );

        if (result.rows.length > 1) {
          await client.query("ROLLBACK");

          return respond(
            {
              error:
                "Duplicate eBay connections require review.",
            },
            409
          );
        }

        const existing = result.rows[0];

        // Reject connections belonging to another user,
        // including legacy records with no verified owner.
        if (existing && existing.userId !== user.id) {
          await client.query("ROLLBACK");

          return respond(
            {
              error:
                "This eBay account is already connected or requires ownership verification.",
            },
            409
          );
        }

        if (existing) {
          await client.query(
            `
              UPDATE public."ebayConnection"
              SET
                "accessToken" = $1,
                "refreshToken" = $2,
                "accessTokenExpiresAt" = $3,
                "refreshTokenExpiresAt" = $4,
                "updatedAt" = NOW()
              WHERE id = $5
                AND "userId" = $6
            `,
            [
              tokenData.access_token,
              tokenData.refresh_token,
              accessTokenExpiresAt,
              refreshTokenExpiresAt,
              existing.id,
              user.id,
            ]
          );
        } else {
          await client.query(
            `
              INSERT INTO public."ebayConnection" (
                "userId",
                "ebayUserId",
                environment,
                "accessToken",
                "refreshToken",
                "accessTokenExpiresAt",
                "refreshTokenExpiresAt",
                "createdAt",
                "updatedAt"
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                NOW(), NOW()
              )
            `,
            [
              user.id,
              ebayUserId,
              environment,
              tokenData.access_token,
              tokenData.refresh_token,
              accessTokenExpiresAt,
              refreshTokenExpiresAt,
            ]
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }

    // STEP 10: Return success without exposing tokens.
    return respond({
      success: true,
      message: `eBay ${environment} account connected successfully.`,
      environment,
      ebayUserId,
    });
  } catch (error) {
    console.error("eBay OAuth callback error:", error);

    return respond(
      { error: "Something went wrong connecting eBay." },
      500
    );
  }
}
