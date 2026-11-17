// Category and brand for listings, from eBay's public item lookup (the
// Browse API, with ProfitSync's own app sign-in, not the seller's). Used by
// the Reports page to show profit by category and by brand. Read once per
// listing and saved; a listing is looked up again after 30 days.

export type ItemDetails = { category: string | null; categoryPath: string | null; brand: string | null };

type BrowseItem = {
  categoryPath?: string;
  brand?: string;
  localizedAspects?: Array<{ name?: string; value?: string }>;
};

const clean = (value: string | undefined | null, max: number) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

// eBay's category path looks like "Sports Mem, Cards & Fan Shop|Fan
// Apparel & Souvenirs|Soccer-International Clubs". The last part is the
// most useful name for a report.
export function parseItemDetails(data: unknown): ItemDetails {
  const item = (data ?? {}) as BrowseItem;
  const path = clean(item.categoryPath, 300);
  const parts = path ? path.split("|").map((p) => p.trim()).filter(Boolean) : [];
  const aspectBrand = item.localizedAspects?.find((a) => a.name?.trim().toLowerCase() === "brand")?.value;
  let brand = clean(item.brand ?? aspectBrand, 80);
  // Sellers often fill Brand with placeholders.
  if (brand && /^(unbranded|unknown|n\/?a|none|no brand|generic|does not apply)$/i.test(brand)) brand = null;
  return { category: parts.length ? parts[parts.length - 1].slice(0, 120) : null, categoryPath: path, brand };
}

export async function appToken(apiBase: string): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const response = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString(),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

// eBay's answer when a listing has options (sizes, colours): it has to be
// read as an "item group" instead.
const ITEM_GROUP_ERROR = 11006;

// The first few failed lookups are logged (status and eBay's error id),
// so a problem shows up in the server logs.
let failuresLogged = 0;
function logFailure(itemId: string, step: string, status: number, errorIds: number[]) {
  if (failuresLogged >= 5) return;
  failuresLogged += 1;
  console.warn("eBay item details unavailable:", { itemId, step, status, errorIds });
}

type BrowseError = { errors?: Array<{ errorId?: number }> };

// Details for one listing, or null when eBay can't show it (ended or
// private). Listings with options are read through their item group.
export async function fetchItemDetails(apiBase: string, token: string, itemId: string): Promise<ItemDetails | null> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" };
  try {
    const response = await fetch(`${apiBase}/buy/browse/v1/item/get_item_by_legacy_id?${new URLSearchParams({ legacy_item_id: itemId })}`, {
      headers,
      cache: "no-store",
    });
    if (response.ok) return parseItemDetails(await response.json());

    const body = (await response.json().catch(() => ({}))) as BrowseError;
    const errorIds = (body.errors ?? []).map((e) => e.errorId ?? 0);
    if (!errorIds.includes(ITEM_GROUP_ERROR)) {
      logFailure(itemId, "item", response.status, errorIds);
      return null;
    }

    const group = await fetch(`${apiBase}/buy/browse/v1/item/get_items_by_item_group?${new URLSearchParams({ item_group_id: itemId })}`, {
      headers,
      cache: "no-store",
    });
    if (!group.ok) {
      const groupBody = (await group.json().catch(() => ({}))) as BrowseError;
      logFailure(itemId, "item group", group.status, (groupBody.errors ?? []).map((e) => e.errorId ?? 0));
      return null;
    }
    return parseItemGroup(await group.json());
  } catch (error) {
    logFailure(itemId, "network", 0, []);
    console.warn("eBay item details request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// An item group (a listing with options): category and brand are the same
// for every option, so the first one with them is used.
export function parseItemGroup(data: unknown): ItemDetails | null {
  const items = ((data ?? {}) as { items?: unknown[] }).items ?? [];
  let found: ItemDetails | null = null;
  for (const item of items) {
    const details = parseItemDetails(item);
    if (!found) found = details;
    else {
      found = {
        category: found.category ?? details.category,
        categoryPath: found.categoryPath ?? details.categoryPath,
        brand: found.brand ?? details.brand,
      };
    }
    if (found.category && found.brand) break;
  }
  return found;
}

// Look up several listings, a few at a time.
export async function fetchManyItemDetails(apiBase: string, token: string, itemIds: string[], parallel = 5) {
  const found = new Map<string, ItemDetails | null>();
  for (let i = 0; i < itemIds.length; i += parallel) {
    const batch = itemIds.slice(i, i + parallel);
    const results = await Promise.all(batch.map((id) => fetchItemDetails(apiBase, token, id)));
    batch.forEach((id, j) => found.set(id, results[j]));
  }
  return found;
}
