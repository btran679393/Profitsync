import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveEbayUserId } from "@/lib/ebay/activeStore";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// GET: expenses for the store being viewed, plus business-wide ones.
export async function GET() {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ enabled: false, expenses: [] });

  const pool = newPool();
  try {
    const store = await resolveActiveEbayUserId(pool, user);
    const result = await pool.query(
      `
      SELECT id, "ebayUserId", to_char("spentOn", 'YYYY-MM-DD') AS "spentOn", category, amount, note
      FROM public."expense"
      WHERE "userId" = $1 AND ($2::text IS NULL OR "ebayUserId" = $2 OR "ebayUserId" IS NULL)
      ORDER BY "spentOn" DESC, id DESC
      `,
      [user.id, store]
    );
    return NextResponse.json(
      { enabled: true, expenses: result.rows },
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

// POST { spentOn, category, amount, note?, wholeBusiness? }: add an expense.
export async function POST(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const spentOn = typeof body.spentOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.spentOn) ? body.spentOn : null;
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(String(body.category)) ? String(body.category) : null;
  const amountText = String(body.amount ?? "").trim();
  const amount = /^\d+(\.\d{1,2})?$/.test(amountText) ? Number(amountText) : NaN;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  if (!spentOn || !category || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    return NextResponse.json({ error: "Enter a date, a category and an amount like 12.50." }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  const pool = newPool();
  try {
    const store = body.wholeBusiness === true ? null : await resolveActiveEbayUserId(pool, user);
    const result = await pool.query(
      `
      INSERT INTO public."expense" ("userId", "ebayUserId", "spentOn", category, amount, note)
      VALUES ($1, $2, $3::date, $4, $5::numeric, NULLIF($6, ''))
      RETURNING id
      `,
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

// DELETE { id }: remove one of your expenses.
export async function DELETE(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let id: number;
  try {
    id = Number(((await request.json()) as { id?: unknown }).id);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
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
