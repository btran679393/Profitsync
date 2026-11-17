import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
import { getUserPlan } from "@/lib/billing/server";
import { saveListingCost } from "@/lib/listingCost";
import { setupNeeded } from "@/lib/setupNeeded";
import {
  MAX_ITEMS_PER_PURCHASE,
  MAX_ITEM_NAME_LENGTH,
  MAX_SOURCE_LENGTH,
  cleanText,
  parseDollars,
  parseQuantity,
  splitPurchaseCost,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Purchases and the items in them (docs/sql/2026-11-17_inventory.sql).
//
// GET                         purchases + items for the store being viewed
//                             (and business-wide ones)
// POST   { purchasedOn, source, note?, totalPaid, wholeBusiness?,
//          items: [{ name, quantity, estimate?, ebayItemId? }] }
//                             a new purchase; totalPaid is split across items
// POST   { purchaseId, name, quantity, unitCost, ebayItemId? }
//                             one more item in an existing purchase
// PATCH  { purchaseId, purchasedOn?, source?, note? }
// PATCH  { itemId, name?, quantity?, unitCost?, ebayItemId?, useAsListingCost? }
//                             linking a listing can also make the item's cost
//                             that listing's cost (filled into its sales
//                             since the purchase that don't have one)
// DELETE { purchaseId } | { itemId }

const SQL_FILE = "docs/sql/2026-11-17_inventory.sql";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LISTING_ID = /^\d{1,20}$/;

function isMissingTable(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error ? null : user;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function failed(error: unknown, action: string) {
  if (isMissingTable(error)) return bad(setupNeeded("Inventory", SQL_FILE), 409);
  console.error(`Inventory: ${action} failed:`, error);
  return bad(`Couldn't ${action}. Please try again.`, 500);
}

// The listing must be one of the seller's own.
async function ownsListing(client: PoolClient, userId: string, ebayItemId: string) {
  const result = await client.query(
    `SELECT 1 FROM public."EbayListing" WHERE "userId" = $1 AND "ebayItemId" = $2 AND environment = 'PRODUCTION'`,
    [userId, ebayItemId]
  );
  return Boolean(result.rowCount);
}

function listingId(value: unknown): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value === "string" && LISTING_ID.test(value)) return value;
  return undefined;
}

// Inventory is part of Pro and Ultimate.
async function notOnPlan(userId: string) {
  const { limits } = await getUserPlan(getPool(), userId);
  return limits.inventory ? null : NextResponse.json({ error: "Inventory is part of Pro and Ultimate.", upgrade: true }, { status: 402 });
}

export async function GET() {
  const user = await signedInUser();
  if (!user) return bad("Authentication required.", 401);
  if (!process.env.DATABASE_URL) return NextResponse.json({ enabled: false, purchases: [], items: [] });
  const locked = await notOnPlan(user.id);
  if (locked) return locked;

  const pool = getPool();
  try {
    const store = await resolveActiveEbayUserId(pool, user);
    const purchases = await pool.query(
      `
      SELECT id, "ebayUserId", to_char("purchasedOn", 'YYYY-MM-DD') AS "purchasedOn", source, note
      FROM public."purchase"
      WHERE "userId" = $1 AND ($2::text IS NULL OR "ebayUserId" = $2 OR "ebayUserId" IS NULL)
      ORDER BY "purchasedOn" DESC, id DESC
      `,
      [user.id, store]
    );
    const ids = purchases.rows.map((row) => row.id);
    const items = ids.length
      ? await pool.query(
          `
          SELECT id, "purchaseId", name, quantity, "unitCost", "ebayItemId"
          FROM public."inventoryItem"
          WHERE "userId" = $1 AND "purchaseId" = ANY($2::bigint[])
          ORDER BY id ASC
          `,
          [user.id, ids]
        )
      : { rows: [] };
    return NextResponse.json(
      {
        enabled: true,
        purchases: purchases.rows.map((row) => ({ ...row, id: Number(row.id) })),
        items: items.rows.map((row) => ({ ...row, id: Number(row.id), purchaseId: Number(row.purchaseId) })),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (isMissingTable(error)) return NextResponse.json({ enabled: false, purchases: [], items: [] });
    return failed(error, "load your inventory");
  }
}

export async function POST(request: Request) {
  const user = await signedInUser();
  if (!user) return bad("Authentication required.", 401);
  const body = await readBody(request);
  if (!body) return bad("Invalid JSON body.");
  if (!process.env.DATABASE_URL) return bad("Database configuration unavailable.", 503);
  const locked = await notOnPlan(user.id);
  if (locked) return locked;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // One more item in an existing purchase.
    if (body.purchaseId !== undefined) {
      const purchaseId = Number(body.purchaseId);
      const name = cleanText(body.name, MAX_ITEM_NAME_LENGTH);
      const quantity = parseQuantity(body.quantity);
      const unitCents = parseDollars(body.unitCost);
      const ebayItemId = listingId(body.ebayItemId ?? null);
      if (!Number.isSafeInteger(purchaseId) || !name || !quantity || unitCents === null || ebayItemId === undefined) {
        await client.query("ROLLBACK");
        return bad("Enter a name, a quantity and a cost like 4.50.");
      }
      const owner = await client.query(`SELECT 1 FROM public."purchase" WHERE id = $1 AND "userId" = $2`, [purchaseId, user.id]);
      if (!owner.rowCount) {
        await client.query("ROLLBACK");
        return bad("Purchase not found.", 404);
      }
      if (ebayItemId && !(await ownsListing(client, user.id, ebayItemId))) {
        await client.query("ROLLBACK");
        return bad("That listing isn't in your store. Refresh your listings and try again.");
      }
      const result = await client.query(
        `INSERT INTO public."inventoryItem" ("userId", "purchaseId", name, quantity, "unitCost", "ebayItemId")
         VALUES ($1, $2, $3, $4, $5::numeric, $6) RETURNING id`,
        [user.id, purchaseId, name, quantity, (unitCents / 100).toFixed(2), ebayItemId]
      );
      await client.query("COMMIT");
      return NextResponse.json({ success: true, id: Number(result.rows[0].id) });
    }

    // A new purchase with its items.
    const purchasedOn = typeof body.purchasedOn === "string" && DATE.test(body.purchasedOn) && body.purchasedOn <= today() ? body.purchasedOn : null;
    const source = cleanText(body.source, MAX_SOURCE_LENGTH);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
    const totalCents = parseDollars(body.totalPaid);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!purchasedOn || !source || totalCents === null) {
      await client.query("ROLLBACK");
      return bad("Enter the date, where you bought it and what you paid.");
    }
    if (rawItems.length === 0 || rawItems.length > MAX_ITEMS_PER_PURCHASE) {
      await client.query("ROLLBACK");
      return bad(`Add between 1 and ${MAX_ITEMS_PER_PURCHASE} items.`);
    }
    const lines: Array<{ name: string; quantity: number; estimate: number | null; ebayItemId: string | null }> = [];
    for (const raw of rawItems) {
      const entry = (raw ?? {}) as Record<string, unknown>;
      const name = cleanText(entry.name, MAX_ITEM_NAME_LENGTH);
      const quantity = parseQuantity(entry.quantity);
      const estimateCents = entry.estimate === undefined || entry.estimate === null || entry.estimate === "" ? null : parseDollars(entry.estimate);
      const ebayItemId = listingId(entry.ebayItemId ?? null);
      if (!name || !quantity || (entry.estimate && estimateCents === null) || ebayItemId === undefined) {
        await client.query("ROLLBACK");
        return bad("Each item needs a name and a quantity (and an expected price like 25, if you add one).");
      }
      if (ebayItemId && !(await ownsListing(client, user.id, ebayItemId))) {
        await client.query("ROLLBACK");
        return bad("One of those listings isn't in your store. Refresh your listings and try again.");
      }
      lines.push({ name, quantity, estimate: estimateCents === null ? null : estimateCents / 100, ebayItemId });
    }

    const store = body.wholeBusiness === true ? null : await resolveActiveEbayUserId(client, user);
    const purchase = await client.query(
      `INSERT INTO public."purchase" ("userId", "ebayUserId", "purchasedOn", source, note)
       VALUES ($1, $2, $3::date, $4, NULLIF($5, '')) RETURNING id`,
      [user.id, store, purchasedOn, source, note]
    );
    const purchaseId = Number(purchase.rows[0].id);
    const split = splitPurchaseCost(totalCents, lines);
    let costsApplied = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await client.query(
        `INSERT INTO public."inventoryItem" ("userId", "purchaseId", name, quantity, "unitCost", "ebayItemId")
         VALUES ($1, $2, $3, $4, $5::numeric, $6)`,
        [user.id, purchaseId, line.name, line.quantity, split[i].unitCost.toFixed(2), line.ebayItemId]
      );
      // A linked listing takes this cost, for sales since the purchase.
      if (line.ebayItemId && body.useAsListingCost !== false) {
        const saved = await saveListingCost(client, {
          userId: user.id,
          itemId: line.ebayItemId,
          field: "unitCost",
          value: split[i].unitCost,
          applyToPast: true,
          since: purchasedOn,
        });
        costsApplied += saved?.applied ?? 0;
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ success: true, id: purchaseId, costsApplied });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return failed(error, "save the purchase");
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  const user = await signedInUser();
  if (!user) return bad("Authentication required.", 401);
  const body = await readBody(request);
  if (!body) return bad("Invalid JSON body.");
  if (!process.env.DATABASE_URL) return bad("Database configuration unavailable.", 503);
  const locked = await notOnPlan(user.id);
  if (locked) return locked;

  const sets: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(sql.replace("?", `$${values.length + 2}`));
  };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (body.purchaseId !== undefined) {
      const id = Number(body.purchaseId);
      if (!Number.isSafeInteger(id)) {
        await client.query("ROLLBACK");
        return bad("Invalid purchase.");
      }
      if ("purchasedOn" in body) {
        if (typeof body.purchasedOn !== "string" || !DATE.test(body.purchasedOn) || body.purchasedOn > today()) {
          await client.query("ROLLBACK");
          return bad("Choose a date that isn't in the future.");
        }
        add(`"purchasedOn" = ?::date`, body.purchasedOn);
      }
      if ("source" in body) {
        const source = cleanText(body.source, MAX_SOURCE_LENGTH);
        if (!source) {
          await client.query("ROLLBACK");
          return bad(`Say where you bought it (up to ${MAX_SOURCE_LENGTH} characters).`);
        }
        add(`source = ?`, source);
      }
      if ("note" in body) add(`note = NULLIF(?, '')`, typeof body.note === "string" ? body.note.trim().slice(0, 200) : "");
      if (sets.length === 0) {
        await client.query("ROLLBACK");
        return bad("Nothing to change.");
      }
      const result = await client.query(
        `UPDATE public."purchase" SET ${sets.join(", ")} WHERE id = $1 AND "userId" = $2`,
        [id, user.id, ...values]
      );
      await client.query("COMMIT");
      return result.rowCount ? NextResponse.json({ success: true }) : bad("Purchase not found.", 404);
    }

    const id = Number(body.itemId);
    if (!Number.isSafeInteger(id)) {
      await client.query("ROLLBACK");
      return bad("Invalid item.");
    }
    if ("name" in body) {
      const name = cleanText(body.name, MAX_ITEM_NAME_LENGTH);
      if (!name) {
        await client.query("ROLLBACK");
        return bad("Enter a name.");
      }
      add(`name = ?`, name);
    }
    if ("quantity" in body) {
      const quantity = parseQuantity(body.quantity);
      if (!quantity) {
        await client.query("ROLLBACK");
        return bad("Enter a quantity of 1 or more.");
      }
      add(`quantity = ?`, quantity);
    }
    let unitCost: number | null = null;
    if ("unitCost" in body) {
      const unitCents = parseDollars(body.unitCost);
      if (unitCents === null) {
        await client.query("ROLLBACK");
        return bad("Enter a cost like 4.50.");
      }
      unitCost = unitCents / 100;
      add(`"unitCost" = ?::numeric`, unitCost.toFixed(2));
    }
    let linkTo: string | null | undefined;
    if ("ebayItemId" in body) {
      linkTo = listingId(body.ebayItemId);
      if (linkTo === undefined) {
        await client.query("ROLLBACK");
        return bad("Invalid listing.");
      }
      if (linkTo && !(await ownsListing(client, user.id, linkTo))) {
        await client.query("ROLLBACK");
        return bad("That listing isn't in your store. Refresh your listings and try again.");
      }
      add(`"ebayItemId" = ?`, linkTo);
    }
    if (sets.length === 0) {
      await client.query("ROLLBACK");
      return bad("Nothing to change.");
    }
    const result = await client.query<{ unitCost: string; ebayItemId: string | null; purchasedOn: string }>(
      `
      UPDATE public."inventoryItem" i SET ${sets.join(", ")}
      FROM public."purchase" p
      WHERE i.id = $1 AND i."userId" = $2 AND p.id = i."purchaseId"
      RETURNING i."unitCost", i."ebayItemId", to_char(p."purchasedOn", 'YYYY-MM-DD') AS "purchasedOn"
      `,
      [id, user.id, ...values]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return bad("Item not found.", 404);
    }
    let costsApplied = 0;
    const row = result.rows[0];
    if (body.useAsListingCost === true && row.ebayItemId) {
      const saved = await saveListingCost(client, {
        userId: user.id,
        itemId: row.ebayItemId,
        field: "unitCost",
        value: unitCost ?? Number(row.unitCost),
        applyToPast: true,
        since: row.purchasedOn,
      });
      costsApplied = saved?.applied ?? 0;
    }
    await client.query("COMMIT");
    return NextResponse.json({ success: true, costsApplied });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return failed(error, "save the change");
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const user = await signedInUser();
  if (!user) return bad("Authentication required.", 401);
  const body = await readBody(request);
  if (!body) return bad("Invalid JSON body.");
  if (!process.env.DATABASE_URL) return bad("Database configuration unavailable.", 503);
  const locked = await notOnPlan(user.id);
  if (locked) return locked;

  const pool = getPool();
  try {
    const purchaseId = Number(body.purchaseId);
    const itemId = Number(body.itemId);
    // Deleting a purchase deletes its items too (ON DELETE CASCADE).
    const result =
      body.purchaseId !== undefined && Number.isSafeInteger(purchaseId)
        ? await pool.query(`DELETE FROM public."purchase" WHERE id = $1 AND "userId" = $2`, [purchaseId, user.id])
        : body.itemId !== undefined && Number.isSafeInteger(itemId)
          ? await pool.query(`DELETE FROM public."inventoryItem" WHERE id = $1 AND "userId" = $2`, [itemId, user.id])
          : null;
    if (!result) return bad("Choose a purchase or an item to delete.");
    return result.rowCount ? NextResponse.json({ success: true }) : bad("Not found.", 404);
  } catch (error) {
    return failed(error, "delete it");
  }
}
