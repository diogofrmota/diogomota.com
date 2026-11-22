import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// /sitemap.xml: the pages that are open to everyone and may be indexed (the
// rest say noindex: the apps, the account and the forms).
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/about", "/privacy"].map((path) => ({ url: new URL(path, siteUrl).href }));
}
