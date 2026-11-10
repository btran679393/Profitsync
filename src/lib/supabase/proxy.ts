
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// The public website pages anyone can open without signing in.
const PUBLIC_SITE_PAGES = new Set(["/welcome", "/pricing", "/contact", "/terms", "/refunds", "/privacy"]);

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
    PUBLIC_SITE_PAGES.has(pathname.replace(/\/+$/, "") || "/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/callback") ||
    // Link-preview image, robots.txt and sitemap for search engines.
    pathname.startsWith("/opengraph-image") ||
    pathname.startsWith("/twitter-image") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/icon") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml";

  // Visitors who aren't signed in see the home page at "/" instead of
  // being sent to the login page.
  if (!isAuthenticated && pathname === "/") {
    const welcome = NextResponse.rewrite(new URL("/welcome", request.url));
    response.cookies.getAll().forEach((cookie) => welcome.cookies.set(cookie));
    return welcome;
  }

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

    // The app itself lives at "/" (handled above), so any other address a
    // signed-out visitor asks for isn't a real private page: let it through
    // so they see the friendly "page not found" page, not the login screen.
    // If a new private page is ever added, send it to /login here.
    return response;
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
