import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Browser security rules sent with every page.
//
// Content-Security-Policy says where the page may load things from:
// - scripts and styles only from this site (Next.js and the theme script
//   need inline ones, hence 'unsafe-inline'; dev mode also needs eval and
//   a websocket for hot reload),
// - data calls only to this site and Supabase (sign-in, sessions),
// - images from anywhere secure (eBay listing photos, profile pictures),
// - nobody may show ProfitSync inside a frame on their own site
//   (frame-ancestors / X-Frame-Options), which stops click-jacking.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
