import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { rateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { setupNeeded } from "@/lib/setupNeeded";
import { REPORT_MESSAGE_MAX, cleanReportMessage, isReportField } from "@/lib/numberReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { orderId, field, message }: a seller flags a number on one of their
// orders. The server copies that order's numbers into the report, so what you
// read later is exactly what they saw.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await rateLimit("numberReport", user.id);
  if (limited) return limited;
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error();
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orderId = Number(body.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  if (!isReportField(body.field)) return NextResponse.json({ error: "Choose what looks wrong." }, { status: 400 });
  const message = cleanReportMessage(body.message);
  if (message === null) {
    return NextResponse.json({ error: `Please keep the note under ${REPORT_MESSAGE_MAX} characters.` }, { status: 400 });
  }

  const pool = getPool();
  try {
    // Only the seller's own order; nothing else can be attached.
    const result = await pool.query<{ id: number }>(
      `
      INSERT INTO public."numberReport" ("userId", "orderId", "ebayOrderId", field, message, snapshot)
      SELECT o."userId", o.id, o."ebayOrderId", $3, $4,
             jsonb_build_object(
               'salePrice', o."salePrice", 'ebayFees', o."ebayFees", 'otherFees', o."otherFees",
               'shippingLabelCost', o."shippingLabelCost", 'shippingCost', o."shippingCost",
               'productCost', o."productCost", 'refundAmount', o."refundAmount",
               'refundOutcome', o."refundOutcome", 'refundShippingLoss', o."refundShippingLoss",
               'refundFeeLoss', o."refundFeeLoss", 'status', o.status, 'quantity', o.quantity,
               'orderDate', o."orderDate", 'ebayUserId', o."ebayUserId"
             )
      FROM public."order" o
      WHERE o.id = $1 AND o."userId" = $2
      RETURNING id
      `,
      [orderId, user.id, body.field, message]
    );
    if (!result.rowCount) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    console.info("Number report received:", result.rows[0].id, body.field);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") {
      return NextResponse.json({ error: setupNeeded("Reporting a number", "docs/sql/2026-11-21_number_reports.sql") }, { status: 409 });
    }
    console.error("Saving a number report failed:", e);
    return NextResponse.json({ error: "Couldn't send that. Please try again." }, { status: 500 });
  }
}
