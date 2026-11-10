import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Search engines may read the public pages; the app and its API are private.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/reset-password"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
