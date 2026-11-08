import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
import { existingColumns } from "@/lib/db/optionalColumns";
import { cleanCategory } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Added by docs/sql/2026-11-08_expense_repeat.sql.
const REPEAT_COLUMNS = ["repeatMonthly", "endedOn"];

// Postgres "undefined table": the expenses SQL hasn't been run yet.
function isMissingTable(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}

function newPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
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
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseAmount(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return amount >= 0 && amount <= 1_000_000 ? amount : null;
}

async function canRepeat(pool: Pool) {
  const columns = await existingColumns(pool, "expense", REPEAT_COLUMNS);
  return REPEAT_COLUMNS.every((c) => columns.has(c));
}

// GET: expenses for the store being viewed, plus business-wide ones.
export async function GET() {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ enabled: false, expenses: [] });

  const pool = newPool();
  try {
    const store = await resolveActiveEbayUserId(pool, user);
    const repeat = await canRepeat(pool);
    const extra = repeat ? `, "repeatMonthly", to_char("endedOn", 'YYYY-MM-DD') AS "endedOn"` : "";
    const result = await pool.query(
      `
      SELECT id, "ebayUserId", to_char("spentOn", 'YYYY-MM-DD') AS "spentOn", category, amount, note${extra}
      FROM public."expense"
      WHERE "userId" = $1 AND ($2::text IS NULL OR "ebayUserId" = $2 OR "ebayUserId" IS NULL)
      ORDER BY "spentOn" DESC, id DESC
      `,
      [user.id, store]
    );
    return NextResponse.json(
      { enabled: true, canRepeat: repeat, expenses: result.rows },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ enabled: false, expenses: [] });
    console.error("Loading expenses failed:", e);
    return NextResponse.json({ error: "Couldn't load expenses." }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// POST { spentOn, category, amount, note?, wholeBusiness?, repeatMonthly? }
export async function POST(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const spentOn = typeof body.spentOn === "string" && DATE.test(body.spentOn) ? body.spentOn : null;
  const category = cleanCategory(body.category);
  const amount = parseAmount(body.amount);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  if (!spentOn || !category || amount === null) {
    return NextResponse.json({ error: "Enter a date, a category and an amount like 12.50." }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = newPool();
  try {
    const store = body.wholeBusiness === true ? null : await resolveActiveEbayUserId(pool, user);
    const repeat = body.repeatMonthly === true;
    if (repeat && !(await canRepeat(pool))) {
      return NextResponse.json(
        { error: "Repeating expenses need a one-time database update first (docs/sql/2026-11-08_expense_repeat.sql)." },
        { status: 409 }
      );
    }
    const result = await pool.query(
      repeat
        ? `INSERT INTO public."expense" ("userId", "ebayUserId", "spentOn", category, amount, note, "repeatMonthly")
           VALUES ($1, $2, $3::date, $4, $5::numeric, NULLIF($6, ''), true) RETURNING id`
        : `INSERT INTO public."expense" ("userId", "ebayUserId", "spentOn", category, amount, note)
           VALUES ($1, $2, $3::date, $4, $5::numeric, NULLIF($6, '')) RETURNING id`,
      [user.id, store, spentOn, category, amount.toFixed(2), note]
    );
    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        { error: "Expenses need a one-time database update first (docs/sql/2026-11-07_expenses.sql)." },
        { status: 409 }
      );
    }
    console.error("Adding expense failed:", e);
    return NextResponse.json({ error: "Couldn't add the expense." }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// PATCH { id, spentOn?, category?, amount?, note?, repeatMonthly?, endedOn? }:
// change one of your expenses. endedOn: "YYYY-MM-DD" stops a repeating
// expense after that day; null starts it repeating again.
export async function PATCH(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid expense." }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [id, user.id];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(sql.replace("?", `$${values.length}`));
  };

  if ("spentOn" in body) {
    if (typeof body.spentOn !== "string" || !DATE.test(body.spentOn)) {
      return NextResponse.json({ error: "Choose a date." }, { status: 400 });
    }
    add(`"spentOn" = ?::date`, body.spentOn);
  }
  if ("category" in body) {
    const category = cleanCategory(body.category);
    if (!category) return NextResponse.json({ error: "Enter a category (up to 40 characters)." }, { status: 400 });
    add(`category = ?`, category);
  }
  if ("amount" in body) {
    const amount = parseAmount(body.amount);
    if (amount === null) return NextResponse.json({ error: "Enter an amount like 12.50." }, { status: 400 });
    add(`amount = ?::numeric`, amount.toFixed(2));
  }
  if ("note" in body) {
    add(`note = NULLIF(?, '')`, typeof body.note === "string" ? body.note.trim().slice(0, 200) : "");
  }
  const repeatFields = "repeatMonthly" in body || "endedOn" in body;
  if ("repeatMonthly" in body) add(`"repeatMonthly" = ?`, body.repeatMonthly === true);
  if ("endedOn" in body) {
    if (body.endedOn !== null && (typeof body.endedOn !== "string" || !DATE.test(body.endedOn))) {
      return NextResponse.json({ error: "Invalid stop date." }, { status: 400 });
    }
    add(`"endedOn" = ?::date`, body.endedOn);
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = newPool();
  try {
    if (repeatFields && !(await canRepeat(pool))) {
      return NextResponse.json(
        { error: "Repeating expenses need a one-time database update first (docs/sql/2026-11-08_expense_repeat.sql)." },
        { status: 409 }
      );
    }
    const result = await pool.query(
      `UPDATE public."expense" SET ${sets.join(", ")} WHERE id = $1 AND "userId" = $2`,
      values
    );
    if (!result.rowCount) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Updating expense failed:", e);
    return NextResponse.json({ error: "Couldn't save the expense." }, { status: 500 });
  } finally {
    await pool.end();
  }
}

// DELETE { id }: remove one of your expenses (a repeating one goes entirely).
export async function DELETE(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await readBody(request);
  const id = Number(body?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid expense." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = newPool();
  try {
    const result = await pool.query(`DELETE FROM public."expense" WHERE id = $1 AND "userId" = $2`, [id, user.id]);
    if (!result.rowCount) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Deleting expense failed:", e);
    return NextResponse.json({ error: "Couldn't delete the expense." }, { status: 500 });
  } finally {
    await pool.end();
  }
}
