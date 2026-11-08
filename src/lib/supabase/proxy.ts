
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  // Pages that finish a sign-in (social login callback, password-reset link)
  // must not touch the session first. If the browser still has an old, expired
  // login, refreshing it fails and Supabase then clears *all* auth cookies —
  // including the one-time PKCE code verifier the new sign-in needs. That made
  // the first sign-in attempt fail and only the second one work.
  const { pathname: path, searchParams } = request.nextUrl;
  if (
    path.startsWith("/auth/callback") ||
    (path === "/reset-password" && searchParams.has("code"))
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Validate the user's authentication claims.
  const { data, error } = await supabase.auth.getClaims();

  const isAuthenticated = !error && Boolean(data?.claims);

  const pathname = request.nextUrl.pathname;

  // Public pages that do not require a login.
  // /reset-password must be public: people arrive from the reset email
  // before they have a session (the page exchanges the link's code itself).
  const isPublicPage =
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/privacy/" ||
    pathname === "/pricing" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/callback");

  // eBay must be able to deliver account-deletion notifications, and Stripe
  // payment events. Both check their own signatures.
  const isEbayWebhook =
    pathname === "/api/ebay/account-deletion" ||
    pathname === "/api/billing/webhook";

  // Protect all other pages and API routes.
  if (!isAuthenticated && !isPublicPage && !isEbayWebhook) {
    // API requests should return JSON, not an HTML login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";

    return NextResponse.redirect(loginUrl);
  }

  // Signed-in users don't need to see the login page.
  if (isAuthenticated && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/";
    dashboardUrl.search = "";

    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
