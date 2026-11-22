import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// /robots.txt: crawl the website's pages, not the APIs (the calendar
// subscriptions are under /api too). The apps' pages say noindex themselves.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
