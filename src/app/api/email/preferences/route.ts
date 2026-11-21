import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { createClient } from "@/lib/supabase/server";
import { emailConfigured } from "@/lib/email/send";
import { setupNeeded } from "@/lib/setupNeeded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "private, no-store" } };

async function signedInUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET: whether the seller gets the weekly summary email.
export async function GET() {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ weeklySummary: true, sending: emailConfigured() }, noStore);
  try {
    const { rows } = await getPool().query<{ weeklySummary: boolean }>(
      `SELECT "weeklySummary" FROM public."emailPreference" WHERE "userId" = $1`,
      [user.id]
    );
    return NextResponse.json({ weeklySummary: rows[0]?.weeklySummary ?? true, sending: emailConfigured() }, noStore);
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") {
      setupNeeded("Weekly emails", "docs/sql/2026-11-21_email.sql");
      return NextResponse.json({ weeklySummary: true, sending: false }, noStore);
    }
    console.error("Loading email preference failed:", e);
    return NextResponse.json({ error: "Couldn't load your email setting." }, { status: 500 });
  }
}

// PUT { weeklySummary: boolean }: turn the weekly summary on or off.
export async function PUT(request: Request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let weeklySummary: unknown;
  try {
    weeklySummary = ((await request.json()) as { weeklySummary?: unknown }).weeklySummary;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof weeklySummary !== "boolean") return NextResponse.json({ error: "Choose on or off." }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  try {
    await getPool().query(
      `INSERT INTO public."emailPreference" ("userId", "weeklySummary") VALUES ($1, $2)
       ON CONFLICT ("userId") DO UPDATE SET "weeklySummary" = EXCLUDED."weeklySummary", "updatedAt" = now()`,
      [user.id, weeklySummary]
    );
    return NextResponse.json({ weeklySummary });
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") {
      return NextResponse.json({ error: setupNeeded("Weekly emails", "docs/sql/2026-11-21_email.sql") }, { status: 409 });
    }
    console.error("Saving email preference failed:", e);
    return NextResponse.json({ error: "Couldn't save your email setting." }, { status: 500 });
  }
}
