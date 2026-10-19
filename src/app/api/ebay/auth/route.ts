
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const environment =
    process.env.EBAY_ENVIRONMENT === "PRODUCTION"
      ? "PRODUCTION"
      : "SANDBOX";

  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RUNAME;

  if (!clientId || !ruName) {
    return NextResponse.json(
      { error: "Missing eBay OAuth configuration" },
      { status: 500 }
    );
  }

  const scopes = [
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  ];

  const state = randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ruName,
    response_type: "code",
    scope: scopes.join(" "),
    state,
  });

  const authorizationBase =
    environment === "PRODUCTION"
      ? "https://auth.ebay.com"
      : "https://auth.sandbox.ebay.com";

  const authorizationUrl =
    `${authorizationBase}/oauth2/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authorizationUrl);

  response.cookies.set("ebay_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
