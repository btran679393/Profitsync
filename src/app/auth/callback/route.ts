
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  // Use the application's own origin for the redirect.
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  const supabase = await createClient();

  // Exchange the authorization code for a login session.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Supabase authentication callback failed:", error.message);

    return NextResponse.redirect(
      new URL("/login?error=auth_failed", origin)
    );
  }

  // Redirect to the dashboard after successful login.
  return NextResponse.redirect(new URL("/", origin));
}
