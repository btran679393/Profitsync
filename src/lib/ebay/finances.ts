import type { Pool, PoolClient } from "pg";

// Read-only helpers for eBay's Finances API (the payments records behind
// your payouts) plus a valid access token for a store.

type Money = { value?: string; currency?: string };

export type FinanceTransaction = {
  transactionId?: string;
  orderId?: string;
  transactionType?: string;
  transactionDate?: string;
  bookingEntry?: string;
  amount?: Money;
  totalFeeAmount?: Money;
  references?: Array<{ referenceId?: string; referenceType?: string }>;
};

export function moneyCents(value?: Money): number | null {
  if (!value || value.currency !== "USD" || typeof value.value !== "string" || !/^-?\d+(\.\d{1,2})?$/.test(value.value)) {
    return null;
  }
  return Math.round(Number(value.value) * 100);
}

export function transactionOrderId(t: FinanceTransaction): string | undefined {
  return t.orderId || t.references?.find((r) => r.referenceType === "ORDER_ID")?.referenceId || undefined;
}

const PAGE = 200;
const MAX_PAGES = 50;

export async function fetchTransactions(
  financesBase: string,
  accessToken: string,
  type: "SALE" | "REFUND",
  from: Date,
  to: Date
): Promise<FinanceTransaction[]> {
  const filter = `transactionType:{${type}},transactionDate:[${from.toISOString()}..${to.toISOString()}]`;
  const all: FinanceTransaction[] = [];
  const seen = new Set<string>();
  for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
    const response = await fetch(
      `${financesBase}/sell/finances/v1/transaction?${new URLSearchParams({ filter, limit: String(PAGE), offset: String(offset) })}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" }
    );
    if (response.status === 204) break;
    if (!response.ok) {
      console.error(`eBay ${type} transactions failed:`, response.status, (await response.text()).slice(0, 500));
      throw new Error(`eBay's payment records didn't load (HTTP ${response.status}).`);
    }
    const data = (await response.json()) as { transactions?: FinanceTransaction[]; total?: number };
    const items = data.transactions ?? [];
    for (const t of items) {
      if (t.transactionType !== type || !t.transactionId || seen.has(t.transactionId)) continue;
      seen.add(t.transactionId);
      all.push(t);
    }
    offset += items.length;
    if (items.length < PAGE || (typeof data.total === "number" && offset >= data.total)) break;
  }
  return all;
}

export function ebayBases() {
  const production = process.env.EBAY_ENVIRONMENT === "PRODUCTION";
  return {
    api: production ? "https://api.ebay.com" : "https://api.sandbox.ebay.com",
    finances: production ? "https://apiz.ebay.com" : "https://apiz.sandbox.ebay.com",
    environment: production ? "PRODUCTION" : "SANDBOX",
  };
}

export type TokenResult = { token: string } | { reconnect: true } | { error: string };

// A working access token for one store, refreshed (and saved) if it has
// expired. { reconnect } means the seller has to sign in to eBay again.
export async function storeAccessToken(db: Pool | PoolClient, userId: string, ebayUserId: string): Promise<TokenResult> {
  const { api, environment } = ebayBases();
  const { rows } = await db.query<{
    id: number;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  }>(
    `SELECT id, "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt"
     FROM public."ebayConnection" WHERE "userId" = $1 AND environment = $2 AND "ebayUserId" = $3`,
    [userId, environment, ebayUserId]
  );
  const connection = rows[0];
  if (!connection) return { error: "That store isn't connected." };
  if (new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 60_000) return { token: connection.accessToken };
  if (new Date(connection.refreshTokenExpiresAt).getTime() <= Date.now()) return { reconnect: true };

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: "eBay isn't configured." };
  const response = await fetch(`${api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
      scope: [
        "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
        "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
        "https://api.ebay.com/oauth/api_scope/sell.finances",
      ].join(" "),
    }).toString(),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token || !data.expires_in) return { reconnect: true };
  await db.query(`UPDATE public."ebayConnection" SET "accessToken" = $1, "accessTokenExpiresAt" = $2 WHERE id = $3`, [
    data.access_token,
    new Date(Date.now() + data.expires_in * 1000).toISOString(),
    connection.id,
  ]);
  return { token: data.access_token };
}
