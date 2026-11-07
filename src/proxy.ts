
import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Vercel gives every production deployment its own one-off address
// (e.g. profitsync-abc123-btran679393.vercel.app) besides the main one.
// Supabase only sends people back to the main address after Google /
// Microsoft / Facebook sign-in, and the browser keeps the one-time sign-in
// code per address — so starting a sign-in on a one-off address always
// failed. Send page visits on those addresses to the main address instead.
function redirectToMainAddress(request: NextRequest) {
  const mainHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV !== "production" || !mainHost) return null;

  // Use the address the browser actually asked for.
  const host = (
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""
  ).split(",")[0].trim().toLowerCase();
  if (!host || host === mainHost.toLowerCase()) return null;

  const { pathname } = request.nextUrl;
  // Leave API calls (eBay webhooks, OAuth callbacks) alone.
  if (pathname.startsWith("/api/")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = mainHost;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export async function proxy(request: NextRequest) {
  return redirectToMainAddress(request) ?? (await updateSession(request));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
