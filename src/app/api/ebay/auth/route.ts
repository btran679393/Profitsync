
import { createHmac, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // STEP 1: Verify the ProfitSync user is signed in.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please sign in to ProfitSync first." },
        { status: 401 }
      );
    }

    // STEP 2: Determine the eBay environment.
    const environment =
      process.env.EBAY_ENVIRONMENT === "PRODUCTION"
        ? "PRODUCTION"
        : "SANDBOX";

    const clientId = process.env.EBAY_CLIENT_ID;
    const ruName = process.env.EBAY_RUNAME;
    const stateSecret = process.env.EBAY_OAUTH_STATE_SECRET;

    if (!clientId || !ruName || !stateSecret) {
      return NextResponse.json(
        { error: "Missing eBay OAuth configuration." },
        { status: 500 }
      );
    }

    // STEP 3: Request order and identity permissions.
    const scopes = [
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
      "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
    ];

    // STEP 4: Generate a secure OAuth state.
    const state = randomBytes(32).toString("hex");

    // Bind authorization to the signed-in user,
    // eBay environment, and a 10-minute expiration.
    const expiresAt = Date.now() + 10 * 60 * 1000;

    const payload = [
      state,
      user.id,
      environment,
      expiresAt.toString(),
    ].join(".");

    const signature = createHmac("sha256", stateSecret)
      .update(payload)
      .digest("hex");

    const signedState = `${payload}.${signature}`;

    // STEP 5: Build the authorization parameters.
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: ruName,
      response_type: "code",
      scope: scopes.join(" "),
      state,
    });

    // STEP 6: Select the eBay authorization server.
    const authorizationBase =
      environment === "PRODUCTION"
        ? "https://auth.ebay.com"
        : "https://auth.sandbox.ebay.com";

    const authorizationUrl =
      `${authorizationBase}/oauth2/authorize?${params.toString()}`;

    // STEP 7: Redirect the user to eBay.
    const response = NextResponse.redirect(authorizationUrl);

    // Store the signed state for callback verification.
    response.cookies.set("ebay_oauth_state", signedState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Failed to start eBay authorization:", error);

    return NextResponse.json(
      { error: "Unable to connect to eBay." },
      { status: 500 }
    );
  }
}
