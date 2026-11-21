import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEbayUserId, storeAllowedByPlan } from "@/lib/ebay/activeStore";
import { connectedStoreIds, getUserPlan, lockedStoreIds } from "@/lib/billing/server";
import { ebayBases, storeAccessToken } from "@/lib/ebay/finances";
import {
  NO_FUNDS,
  addFunds,
  breakdown,
  parseFunds,
  parsePayoutLines,
  parsePayouts,
  payoutWindow,
  type Payout,
  type PayoutsResponse,
} from "@/lib/ebay/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };
const PAGE = 200;
const MAX_PAGES = 10;

class EbayError extends Error {
  constructor(public status: number) {
    super(`eBay returned HTTP ${status}`);
  }
}

async function ebayGet(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Language": "en-US" },
    cache: "no-store",
  });
  if (response.status === 204) return {};
  if (!response.ok) {
    console.error("eBay payouts request failed:", response.status, (await response.text()).slice(0, 400));
    throw new EbayError(response.status);
  }
  return response.json();
}

// Every page of a Finances API list (payouts or transactions).
async function ebayList(base: string, token: string, filter: string, key: "payouts" | "transactions") {
  const items: unknown[] = [];
  for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
    const data = (await ebayGet(`${base}?${new URLSearchParams({ filter, limit: String(PAGE), offset: String(offset) })}`, token)) as Record<
      string,
      unknown
    >;
    const list = Array.isArray(data[key]) ? (data[key] as unknown[]) : [];
    items.push(...list);
    offset += list.length;
    const total = typeof data.total === "number" ? data.total : null;
    if (list.length < PAGE || (total !== null && offset >= total)) break;
  }
  return { [key]: items };
}

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// GET ?days=90            → money waiting + payouts for the store(s) being viewed
// GET ?payout=ID&store=ID → what one payout was made of
export async function GET(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await rateLimit("ebayApiRead", user.id);
  if (limited) return limited;
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const pool = getPool();
  if (!(await getUserPlan(pool, user.id)).limits.payouts) {
    return NextResponse.json({ error: "Payouts are part of Pro and Ultimate.", upgrade: true }, { status: 402 });
  }
  const { finances } = ebayBases();

  try {
    // One payout's details.
    const payoutId = params.get("payout");
    if (payoutId) {
      const store = params.get("store") ?? "";
      if (!/^[\w-]{1,64}$/.test(payoutId) || !store) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      if (!(await storeAllowedByPlan(pool, user.id, store))) {
        return NextResponse.json({ error: "That store isn't included in your plan." }, { status: 403 });
      }
      const token = await storeAccessToken(pool, user.id, store);
      if ("reconnect" in token) return NextResponse.json({ error: "eBay needs you to sign in again.", reconnect: true }, { status: 401 });
      if ("error" in token) return NextResponse.json({ error: token.error }, { status: 400 });

      const data = await ebayList(`${finances}/sell/finances/v1/transaction`, token.token, `payoutId:{${payoutId}}`, "transactions");
      const lines = parsePayoutLines(data);

      // Item titles from ProfitSync's own orders, so lines read like sales.
      const orderIds = [...new Set(lines.map((l) => l.orderId).filter((id): id is string => Boolean(id)))];
      const titles: Record<string, string> = {};
      if (orderIds.length > 0) {
        const { rows } = await pool.query<{ ebayOrderId: string; item: string | null }>(
          `SELECT DISTINCT ON ("ebayOrderId") "ebayOrderId", item FROM public."order"
           WHERE "userId" = $1 AND "ebayOrderId" = ANY($2::text[])`,
          [user.id, orderIds]
        );
        for (const row of rows) if (row.item) titles[row.ebayOrderId] = row.item;
      }
      return NextResponse.json({ lines, breakdown: breakdown(lines), titles }, { headers: NO_STORE });
    }

    // Money waiting and the payout list.
    const days = Math.min(730, Math.max(7, Number(params.get("days")) || 90));
    const { from, to } = payoutWindow(days);

    const active = await resolveActiveEbayUserId(pool, user);
    let storeIds: string[];
    if (active) storeIds = [active];
    else {
      const ids = await connectedStoreIds(pool, user.id);
      const { limits } = await getUserPlan(pool, user.id);
      const locked = lockedStoreIds(ids, limits);
      storeIds = ids.filter((id) => !locked.has(id));
    }

    const names = new Map<string, string | null>();
    if (storeIds.length > 0) {
      const { rows } = await pool.query<{ ebayUserId: string; storeName: string | null; ebayUsername: string | null }>(
        `SELECT "ebayUserId", "storeName", "ebayUsername" FROM public."ebayConnection" WHERE "userId" = $1 AND "ebayUserId" = ANY($2::text[])`,
        [user.id, storeIds]
      );
      for (const row of rows) names.set(row.ebayUserId, row.storeName || row.ebayUsername || null);
    }

    const result: PayoutsResponse = { funds: NO_FUNDS, payouts: [], reconnect: [], from: from.toISOString(), to: to.toISOString() };
    const perStore = await Promise.all(
      storeIds.map(async (storeId) => {
        const token = await storeAccessToken(pool, user.id, storeId);
        if ("reconnect" in token) return { storeId, reconnect: true as const };
        if ("error" in token) return { storeId, skip: true as const };
        const [funds, payouts] = await Promise.all([
          ebayGet(`${finances}/sell/finances/v1/seller_funds_summary`, token.token),
          ebayList(
            `${finances}/sell/finances/v1/payout`,
            token.token,
            `payoutDate:[${from.toISOString()}..${to.toISOString()}]`,
            "payouts"
          ),
        ]);
        return { storeId, funds: parseFunds(funds), payouts: parsePayouts(payouts, storeId, names.get(storeId) ?? null) };
      })
    );

    const payouts: Payout[] = [];
    for (const entry of perStore) {
      if ("reconnect" in entry) result.reconnect.push(names.get(entry.storeId) ?? "Your store");
      if ("funds" in entry && entry.funds) {
        result.funds = addFunds(result.funds, entry.funds);
        payouts.push(...entry.payouts);
      }
    }
    result.payouts = payouts.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof EbayError) {
      const status = error.status;
      return NextResponse.json(
        {
          error:
            status === 401 || status === 403
              ? "eBay didn't let ProfitSync read your payouts. Reconnect eBay and try again."
              : "eBay's payout records didn't load. Try again in a minute.",
          reconnect: status === 401 || status === 403,
        },
        { status: 502 }
      );
    }
    console.error("Loading payouts failed:", error);
    return NextResponse.json({ error: "Couldn't load your payouts. Try again in a minute." }, { status: 500 });
  }
}
