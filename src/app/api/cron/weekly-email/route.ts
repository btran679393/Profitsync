import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { existingColumns } from "@/lib/db/optionalColumns";
import { connectedStoreIds, getUserPlan, lockedStoreIds } from "@/lib/billing/server";
import { formatOrders, type ApiOrder } from "@/app/dashboard/model";
import { fullyRefundedSql } from "@/lib/refunds";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { renderWeeklyEmail, weeklySummary, worthSending } from "@/lib/email/weekly";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly summary email, run by Vercel Cron (vercel.json) on Monday mornings.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>".
// Each seller gets at most one per 6 days, even if the run is repeated.

const TIME_BUDGET_MS = 240_000;
// Resend's free plan allows about 2 emails a second.
const PAUSE_MS = 600;
const OPTIONAL = ["shippingLabelCost", "otherFees", "shippingCost"];

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Recipient = { id: string; email: string; meta: Record<string, unknown> | null };

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is missing." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database configuration unavailable." }, { status: 503 });
  if (!emailConfigured()) return NextResponse.json({ skipped: "Email isn't set up (RESEND_API_KEY / EMAIL_FROM)." });

  const started = Date.now();
  const now = new Date();
  const pool = getPool();
  const environment = process.env.EBAY_ENVIRONMENT === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const optional = await existingColumns(pool, "order", OPTIONAL);
  const extra = OPTIONAL.filter((c) => optional.has(c)).map((c) => `, "${c}"`).join("");
  const hasNames = (await existingColumns(pool, "ebayConnection", ["storeName", "ebayUsername"])).size === 2;

  // Sellers with a connected store who haven't turned the email off and
  // didn't get one in the last 6 days.
  const { rows: recipients } = await pool.query<Recipient>(
    `
    SELECT u.id::text AS id, u.email, u.raw_user_meta_data AS meta
    FROM auth.users u
    LEFT JOIN public."emailPreference" p ON p."userId" = u.id::text
    WHERE u.email IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL
      AND COALESCE(p."weeklySummary", true)
      AND (p."lastWeeklyEmailAt" IS NULL OR p."lastWeeklyEmailAt" < now() - interval '6 days')
      AND EXISTS (
        SELECT 1 FROM public."ebayConnection" c
        WHERE c."userId" = u.id::text AND c."ebayUserId" IS NOT NULL AND c.environment = $1
      )
    ORDER BY u.created_at
    `,
    [environment]
  );

  const summary = { recipients: recipients.length, sent: 0, nothingToSay: 0, failed: 0, outOfTime: 0 };
  for (const person of recipients) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      summary.outOfTime++;
      continue;
    }
    try {
      const { limits } = await getUserPlan(pool, person.id);
      const all = await connectedStoreIds(pool, person.id);
      const locked = lockedStoreIds(all, limits);
      const stores = all.filter((id) => !locked.has(id));

      const { rows: apiOrders } = await pool.query<ApiOrder>(
        `
        SELECT id, "ebayOrderId", "ebayUserId", "ebayBuyerId", item, "imageUrl", "salePrice", "ebayFees", "productCost",
               status, "refundAmount", "refundedAt", "refundOutcome", "refundShippingLoss", "refundFeeLoss",
               "ebayItemId", quantity, "orderDate"${extra}
        FROM public."order"
        WHERE "userId" = $1 AND environment = $2 AND "ebayUserId" = ANY($3::text[])
          AND "orderDate" >= now() - interval '14 days'
        `,
        [person.id, environment, stores]
      );
      // Each store's "shipping per order" default, as in the app.
      const byStore = (person.meta?.defaultShippingByStore ?? {}) as Record<string, number>;
      const orders = stores.flatMap((store) =>
        formatOrders(apiOrders.filter((o) => o.ebayUserId === store), Number(byStore[store]) || 0)
      );

      const { rows: costRows } = await pool.query<{ n: number }>(
        `
        SELECT count(*)::int AS n FROM public."order"
        WHERE "userId" = $1 AND environment = $2 AND "ebayUserId" = ANY($3::text[])
          AND "productCost" IS NULL AND NOT ${fullyRefundedSql()}
          AND "orderDate" >= now() - interval '90 days'
        `,
        [person.id, environment, stores]
      );

      const { rows: expiring } = await pool.query<{ name: string | null; expires: Date }>(
        `
        SELECT ${hasNames ? `COALESCE("storeName", "ebayUsername")` : "NULL"} AS name, "refreshTokenExpiresAt" AS expires
        FROM public."ebayConnection"
        WHERE "userId" = $1 AND environment = $2 AND "ebayUserId" = ANY($3::text[])
          AND "refreshTokenExpiresAt" < now() + interval '14 days'
        `,
        [person.id, environment, stores]
      );

      const week = weeklySummary(orders, now);
      const fullName = typeof person.meta?.full_name === "string" ? person.meta.full_name : "";
      const extras = {
        firstName: fullName.trim().split(/\s+/)[0] || null,
        needsCost: costRows[0]?.n ?? 0,
        reconnect: expiring.map((r) => ({
          store: r.name || "your eBay store",
          daysLeft: Math.max(0, Math.ceil((new Date(r.expires).getTime() - now.getTime()) / 86_400_000)),
        })),
        appUrl: siteUrl(),
        unsubscribeUrl: unsubscribeUrl(person.id),
      };
      if (!worthSending(week, extras)) {
        summary.nothingToSay++;
        continue;
      }

      const email = renderWeeklyEmail(week, extras);
      const result = await sendEmail({ to: person.email, ...email, unsubscribeUrl: extras.unsubscribeUrl });
      if (!result.ok) {
        console.error("Weekly email failed:", result.error);
        summary.failed++;
      } else {
        summary.sent++;
        await pool.query(
          `INSERT INTO public."emailPreference" ("userId", "lastWeeklyEmailAt") VALUES ($1, now())
           ON CONFLICT ("userId") DO UPDATE SET "lastWeeklyEmailAt" = now()`,
          [person.id]
        );
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    } catch (error) {
      console.error("Weekly email for one seller failed:", error);
      summary.failed++;
    }
  }

  console.log("ProfitSync weekly email:", summary);
  return NextResponse.json(summary);
}
