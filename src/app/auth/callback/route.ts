
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function loginRedirect(origin: string, error: string, description?: string | null) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description.slice(0, 300));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Use the application's own origin for the redirect.
  const origin = request.nextUrl.origin;

  // The provider (Google, Microsoft, Facebook) or Supabase can send the user
  // back with an error instead of a code, e.g. when they cancel the consent
  // screen or the provider isn't configured correctly.
  const providerError = params.get("error");
  if (providerError) {
    const description = params.get("error_description");
    console.error("OAuth provider returned an error:", providerError, description);
    return loginRedirect(origin, providerError, description);
  }

  const code = params.get("code");
  if (!code) {
    return loginRedirect(origin, "missing_code");
  }

  const supabase = await createClient();

  // Exchange the authorization code for a login session.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Supabase authentication callback failed:", error.message);
    return loginRedirect(origin, "auth_failed", error.message);
  }

  // Only allow pages on this site as the post-login destination. Checking
  // the finished address (not just the text) also catches tricks like
  // "/\evil.com", which browsers treat as another site.
  return NextResponse.redirect(safeDestination(params.get("next"), origin));
}

function safeDestination(next: string | null, origin: string): URL {
  const home = new URL("/", origin);
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return home;
  try {
    const url = new URL(next, origin);
    return url.origin === home.origin ? url : home;
  } catch {
    return home;
  }
}
