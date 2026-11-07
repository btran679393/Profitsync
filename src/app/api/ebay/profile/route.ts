import { NextResponse } from "next/server";
import { Pool } from "pg";
import { createClient } from "@/lib/supabase/server";
import { fetchSellerProfile, isMissingColumn, saveSellerProfile } from "@/lib/ebay/sellerProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectionRow = {
  id: number;
  accessToken: string;
  accessTokenExpiresAt: string;
  ebayUsername?: string | null;
  storeName?: string | null;
};

// The connected seller's eBay store name and username, for the dashboard
// greeting. Uses the saved names (refreshed on every listing sync); if none
// are saved yet, asks eBay once and saves them. Problems just return nulls.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const empty = { storeName: null, username: null };
  const noCache = { headers: { "Cache-Control": "private, no-store" } };
  if (!process.env.DATABASE_URL) return NextResponse.json(empty, noCache);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const latestConnection = (columns: string) =>
      pool.query<ConnectionRow>(
        `
        SELECT id, "accessToken", "accessTokenExpiresAt"${columns}
        FROM public."ebayConnection"
        WHERE "userId" = $1 AND environment = 'PRODUCTION' AND "accessToken" IS NOT NULL
        ORDER BY "updatedAt" DESC
        LIMIT 1
        `,
        [user.id]
      );

    let result;
    try {
      result = await latestConnection(`, "ebayUsername", "storeName"`);
    } catch (e) {
      if (!isMissingColumn(e)) throw e;
      result = await latestConnection("");
    }
    const connection = result.rows[0];
    if (!connection) return NextResponse.json(empty, noCache);

    if (connection.storeName || connection.ebayUsername) {
      return NextResponse.json(
        { storeName: connection.storeName ?? null, username: connection.ebayUsername ?? null },
        { headers: { "Cache-Control": "private, max-age=300" } }
      );
    }

    const expiresAt = new Date(connection.accessTokenExpiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60000) {
      return NextResponse.json(empty, noCache);
    }

    const profile = await fetchSellerProfile(connection.accessToken);
    if (!profile) return NextResponse.json(empty, noCache);
    await saveSellerProfile(pool, connection.id, user.id, profile);
    return NextResponse.json(profile, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("Loading eBay profile failed:", e);
    return NextResponse.json(empty, noCache);
  } finally {
    await pool.end();
  }
}
