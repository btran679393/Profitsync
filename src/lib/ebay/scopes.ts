import { ANALYTICS_SCOPE } from "@/lib/ebay/traffic";

// The eBay permissions ProfitSync asks for. Everything is read-only except
// sell.finances, which eBay only offers in one (read) form.

// Asked for when a seller connects a store.
export const CONNECT_SCOPES = [
  // Orders.
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  // Which eBay account it is.
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  // Fees, payouts and refunds.
  "https://api.ebay.com/oauth/api_scope/sell.finances",
  // Listings (read only; ProfitSync never changes listings on eBay).
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  // Listing views, impressions and sales from views.
  ANALYTICS_SCOPE,
];

// Every store has granted at least these.
const BASE_RENEW_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
];

export type RenewedToken = {
  ok: boolean;
  status: number;
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

// Gets a new access token from a refresh token. Asks for the analytics
// permission too, so listing traffic keeps working after the renewal. Stores
// connected before that permission was added haven't granted it, and eBay
// refuses a renewal that asks for more than was granted, so it falls back to
// the base permissions for those (they just don't get traffic numbers until
// they reconnect).
export async function renewAccessToken(apiBase: string, refreshToken: string): Promise<RenewedToken> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, status: 500, error: "missing_credentials" };
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const ask = async (scopes: string[]): Promise<RenewedToken> => {
    const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: scopes.join(" "),
      }).toString(),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Omit<RenewedToken, "ok" | "status">;
    return { ok: response.ok, status: response.status, ...data };
  };

  const withTraffic = await ask([...BASE_RENEW_SCOPES, ANALYTICS_SCOPE]);
  if (!withTraffic.ok && withTraffic.error === "invalid_scope") return ask(BASE_RENEW_SCOPES);
  return withTraffic;
}
