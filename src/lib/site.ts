// Public facts about ProfitSync used on the website pages (home, legal,
// contact) and in link previews. Change them here, in one place.

export const SITE_NAME = "ProfitSync";

export const SITE_DESCRIPTION =
  "See your real eBay profit after fees, shipping, product costs and refunds. Multiple stores, expenses and a tax-ready yearly summary.";

// Where customers write for help, billing questions and data requests.
export const SUPPORT_EMAIL = "brandontran391@gmail.com";

// When the Terms, Refund policy and Privacy policy last changed.
export const LEGAL_UPDATED = "November 9, 2026";

// The site's main address, for link previews, the sitemap and robots.txt.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return "http://localhost:3000";
}
