
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

  // Only allow same-site relative paths as the post-login destination.
  const next = params.get("next");
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return NextResponse.redirect(new URL(destination, origin));
}
