import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/prisma/db";
import { fetchSellerProfile, saveSellerProfile } from "@/lib/ebay/sellerProfile";
import { activeStoreId, pickConnection } from "@/lib/ebay/activeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// eBay Trading API: GetMyeBaySelling
//
// Unlike the Inventory API, this returns every active listing,
// including ones created on eBay.com or with older listing tools.
// ============================================================

const TRADING_API = "https://api.ebay.com/ws/api.dll";
const ENTRIES_PER_PAGE = 200;
const MAX_PAGES = 50;

type ParsedListing = {
  itemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  price: string;
  quantityAvailable: number;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Text of the first <name>…</name> element (exact tag name only).
function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]).trim() : null;
}

function safeImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "ebayimg.com" && !url.hostname.endsWith(".ebayimg.com")) return null;
    // Gallery thumbnails are tiny (s-l140); ask for a sharper size.
    return url.toString().replace(/s-l\d+\./, "s-l500.");
  } catch {
    return null;
  }
}

function parseItem(itemXml: string): ParsedListing | null {
  // Variation details repeat tags like <Quantity>; read top-level values only.
  const xml = itemXml.replace(/<Variations>[\s\S]*?<\/Variations>/g, "");
  const itemId = tag(xml, "ItemID");
  const title = tag(xml, "Title");
  if (!itemId || !/^\d+$/.test(itemId) || !title) return null;

  const sellingStatus = tag(xml, "SellingStatus") ?? "";
  const priceText = tag(sellingStatus, "CurrentPrice") ?? tag(xml, "BuyItNowPrice") ?? tag(xml, "StartPrice");
  const price = Number(priceText);
  if (!Number.isFinite(price) || price < 0) return null;

  const quantity = Number(tag(xml, "Quantity") ?? 0);
  const sold = Number(tag(sellingStatus, "QuantitySold") ?? 0);
  const availableTag = tag(xml, "QuantityAvailable");
  const available = availableTag !== null ? Number(availableTag) : quantity - sold;

  return {
    itemId,
    title: title.slice(0, 500),
    sku: tag(xml, "SKU"),
    imageUrl: safeImageUrl(tag(tag(xml, "PictureDetails") ?? "", "GalleryURL")),
    price: price.toFixed(2),
    quantityAvailable: Math.max(0, Math.trunc(Number.isFinite(available) ? available : 0)),
  };
}

function requestBody(page: number) {
  const exclude = ["ScheduledList", "SoldList", "UnsoldList", "BidList", "DeletedFromSoldList", "DeletedFromUnsoldList"]
    .map((name) => `<${name}><Include>false</Include></${name}>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>Low</WarningLevel>
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${ENTRIES_PER_PAGE}</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
  ${exclude}
</GetMyeBaySellingRequest>`;
}

class EbayTradingError extends Error {
  constructor(message: string, readonly needsReconnect = false) {
    super(message);
  }
}

async function fetchActiveListings(accessToken: string) {
  const listings: ParsedListing[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(TRADING_API, {
      method: "POST",
      headers: {
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1225",
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "Content-Type": "text/xml",
      },
      body: requestBody(page),
      cache: "no-store",
    });
    const xml = await response.text();
    const ack = tag(xml, "Ack");
    if (!response.ok || (ack !== "Success" && ack !== "Warning")) {
      const errors = tag(xml, "Errors") ?? "";
      const code = tag(errors, "ErrorCode");
      const message = tag(errors, "LongMessage") ?? tag(errors, "ShortMessage") ?? `HTTP ${response.status}`;
      console.error("eBay GetMyeBaySelling error:", response.status, code, message);
      // 21916984 / 931 / 932: token invalid, expired or revoked.
      const authProblem = ["21916984", "931", "932", "16110"].includes(code ?? "") || response.status === 401;
      throw new EbayTradingError(
        authProblem
          ? "eBay didn't accept the saved connection. Please reconnect your eBay account."
          : `eBay couldn't return your listings: ${message}`,
        authProblem
      );
    }

    const activeList = tag(xml, "ActiveList") ?? "";
    for (const itemXml of activeList.match(/<Item>[\s\S]*?<\/Item>/g) ?? []) {
      const parsed = parseItem(itemXml);
      if (parsed) listings.push(parsed);
    }

    const totalPages = Number(tag(tag(activeList, "PaginationResult") ?? "", "TotalNumberOfPages") ?? 1);
    if (!Number.isFinite(totalPages) || page >= totalPages) return listings;
  }
  throw new EbayTradingError("Too many listings to load in one go.");
}

export async function POST() {
  let pool: Pool | null = null;

  try {
    // STEP 1: Authenticate the signed-in ProfitSync user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    // STEP 2: Verify database configuration
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: "DATABASE_URL missing." }, { status: 503 });
    }

    // STEP 3: Use the user's most recent PRODUCTION eBay connection
    const environment = "PRODUCTION";
    const connections = await db.orm.public.EbayConnection.where({
      userId: user.id,
      environment,
    }).all();

    const connection = pickConnection(
      connections.filter((c) => Boolean(c.accessToken)),
      activeStoreId(user)
    );

    if (!connection?.ebayUserId) {
      return NextResponse.json(
        { error: "No eBay account connected. Please connect your eBay account." },
        { status: 409 }
      );
    }

    // STEP 4: The order sync refreshes the access token; ask for that first.
    const expiresAt = new Date(connection.accessTokenExpiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60000) {
      return NextResponse.json(
        { error: "Your eBay sign-in needs refreshing. Click \"Sync eBay Orders\" first, then try again.", needsOrderSync: true },
        { status: 401 }
      );
    }

    // STEP 5: Retrieve every active listing from eBay
    let listings: ParsedListing[];
    try {
      listings = await fetchActiveListings(connection.accessToken);
    } catch (error) {
      if (error instanceof EbayTradingError) {
        return NextResponse.json(
          { error: error.message, needsReconnect: error.needsReconnect },
          { status: 502 }
        );
      }
      throw error;
    }

    // STEP 6: Save listings; mark ones no longer active as ended
    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
    const client = await pool.connect();
    let ended = 0;

    try {
      await client.query("BEGIN");
      for (const listing of listings) {
        await client.query(
          `
          INSERT INTO public."EbayListing" (
            "userId", "ebayUserId", environment, "ebayItemId", title, sku,
            "imageUrl", "listingPrice", quantity, status, "updatedAt"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', NOW())
          ON CONFLICT ("userId", "ebayUserId", environment, "ebayItemId")
          DO UPDATE SET
            title = EXCLUDED.title,
            sku = EXCLUDED.sku,
            "imageUrl" = COALESCE(EXCLUDED."imageUrl", public."EbayListing"."imageUrl"),
            "listingPrice" = EXCLUDED."listingPrice",
            quantity = EXCLUDED.quantity,
            status = 'ACTIVE',
            "updatedAt" = NOW()
          `,
          [
            user.id,
            connection.ebayUserId,
            environment,
            listing.itemId,
            listing.title,
            listing.sku,
            listing.imageUrl,
            listing.price,
            listing.quantityAvailable,
          ]
        );
      }

      const endedResult = await client.query(
        `
        UPDATE public."EbayListing"
        SET status = 'ENDED', quantity = 0, "updatedAt" = NOW()
        WHERE "userId" = $1
          AND "ebayUserId" = $2
          AND environment = $3
          AND status = 'ACTIVE'
          AND NOT ("ebayItemId" = ANY($4::text[]))
        `,
        [user.id, connection.ebayUserId, environment, listings.map((l) => l.itemId)]
      );
      ended = endedResult.rowCount ?? 0;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // Keep the seller's eBay username / store name current for the greeting.
    // Never fails the listing sync.
    try {
      const profile = await fetchSellerProfile(connection.accessToken);
      if (profile) await saveSellerProfile(pool, connection.id, user.id, profile);
    } catch (error) {
      console.error("Refreshing eBay store name failed:", error);
    }

    return NextResponse.json({
      success: true,
      environment,
      active: listings.length,
      ended,
      message: `Loaded ${listings.length} active eBay listing${listings.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error("ProfitSync listing synchronization failed:", error);
    return NextResponse.json({ error: "Listing synchronization failed." }, { status: 500 });
  } finally {
    if (pool) await pool.end();
  }
}
