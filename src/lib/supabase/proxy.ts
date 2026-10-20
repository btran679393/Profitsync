
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
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

  // Public pages that do not require a Google login.
  const isPublicPage =
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/privacy/" ||
    pathname.startsWith("/auth/callback");

  // eBay must be able to deliver account-deletion notifications.
  const isEbayWebhook =
    pathname === "/api/ebay/account-deletion";

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
