import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);

// POST: a browser error report (see src/lib/reportClientError.ts). Written
// to the server log, so it shows up in Vercel → Logs / Observability.
// Works signed out too (errors on public pages count), limited per visitor.
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 8000) return new NextResponse(null, { status: 413 });

  let report: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    report = parsed as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const limited = await rateLimit("clientError", userId ?? `ip:${ip}`);
  if (limited) return new NextResponse(null, { status: 429 });

  console.error("Browser error:", {
    message: clip(report.message, 500),
    where: clip(report.where, 40),
    page: clip(report.page, 200)?.split("?")[0],
    digest: clip(report.digest, 100),
    stack: clip(report.stack, 2000),
    signedIn: Boolean(userId),
    userAgent: request.headers.get("user-agent")?.slice(0, 200),
  });
  return new NextResponse(null, { status: 204 });
}
