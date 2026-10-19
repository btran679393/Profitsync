
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export async function GET() {
  // Determine whether we're using Production or Sandbox.
  const environment =
    process.env.EBAY_ENVIRONMENT === "PRODUCTION"
      ? "PRODUCTION"
      : "SANDBOX";

  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RUNAME;

  // Make sure the required eBay settings exist.
  if (!clientId || !ruName) {
    return NextResponse.json(
      { error: "Missing eBay OAuth configuration" },
      { status: 500 }
    );
  }

  // Permissions ProfitSync requests from eBay.
  const scopes = [
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
    "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  ];

  // Generate a random state to protect the OAuth flow.
  const state = randomBytes(32).toString("hex");

  // Prepare the eBay authorization parameters.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ruName,
    response_type: "code",
    scope: scopes.join(" "),
    state,
  });

  // Use the correct eBay authorization website.
  const authorizationBase =
    environment === "PRODUCTION"
      ? "https://auth.ebay.com"
      : "https://auth.sandbox.ebay.com";

  const authorizationUrl =
    `${authorizationBase}/oauth2/authorize?${params.toString()}`;

  // Redirect the seller to eBay for authorization.
  const response = NextResponse.redirect(authorizationUrl);

  // Save the state securely for verification in the callback.
  response.cookies.set("ebay_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
