import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { setupNeeded } from "@/lib/setupNeeded";

// Per-account limits for the expensive actions. Counted in the database
// (table "rateLimit", docs/sql/2026-11-21_rate_limits.sql) so the limit holds
// across all of Vercel's server instances.
//
// If the count can't be checked (table not created yet, database hiccup) the
// request is allowed: a broken limiter must never lock sellers out.

export type Limit = { limit: number; windowSeconds: number };

export const LIMITS = {
  orderSync: { limit: 60, windowSeconds: 3600 },
  listingSync: { limit: 60, windowSeconds: 3600 },
  shippingImport: { limit: 30, windowSeconds: 3600 },
  listingBulk: { limit: 60, windowSeconds: 600 },
  orderBulk: { limit: 30, windowSeconds: 600 },
  clientError: { limit: 20, windowSeconds: 600 },
  ebayApiRead: { limit: 120, windowSeconds: 600 },
  ebayConnect: { limit: 10, windowSeconds: 600 },
  billing: { limit: 10, windowSeconds: 600 },
  accountDelete: { limit: 5, windowSeconds: 3600 },
  numberReport: { limit: 20, windowSeconds: 3600 },
} satisfies Record<string, Limit>;

let warnedMissingTable = false;

// Counts one use of `action` by `userId`. Returns a 429 response to send back
// when the account is over the limit, otherwise null.
export async function rateLimit(action: keyof typeof LIMITS, userId: string): Promise<NextResponse | null> {
  const { limit, windowSeconds } = LIMITS[action];
  if (!process.env.DATABASE_URL) return null;
  try {
    const { rows } = await getPool().query<{ count: number; windowStart: Date }>(
      `
      INSERT INTO public."rateLimit" (key, "windowStart", count)
      VALUES ($1, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        "windowStart" = CASE WHEN "rateLimit"."windowStart" <= now() - make_interval(secs => $2)
                             THEN now() ELSE "rateLimit"."windowStart" END,
        count = CASE WHEN "rateLimit"."windowStart" <= now() - make_interval(secs => $2)
                     THEN 1 ELSE "rateLimit".count + 1 END
      RETURNING count, "windowStart"
      `,
      [`${action}:${userId}`, windowSeconds]
    );
    const row = rows[0];
    if (!row || row.count <= limit) return null;
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(row.windowStart).getTime() + windowSeconds * 1000 - Date.now()) / 1000)
    );
    return NextResponse.json(
      {
        error: "Too many requests.",
        message: `You've done that a lot in a short time. Please try again in ${retryAfter < 120 ? `${retryAfter} seconds` : `${Math.ceil(retryAfter / 60)} minutes`}.`,
        rateLimited: true,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        setupNeeded("Rate limits", "docs/sql/2026-11-21_rate_limits.sql");
      }
    } else {
      console.error("Rate limit check failed:", error);
    }
    return null;
  }
}
