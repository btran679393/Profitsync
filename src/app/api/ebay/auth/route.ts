import { NextResponse } from "next/server";

export async function GET() {
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

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ruName,
    response_type: "code",
    scope: scopes.join(" "),
  });

  const authorizationUrl =
    `https://auth.sandbox.ebay.com/oauth2/authorize?${params.toString()}`;

  return NextResponse.redirect(authorizationUrl);
}