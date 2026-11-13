import type { Metadata, Viewport } from "next";

export const siteUrl = new URL("https://diogomota.com");
export const siteName = "diogo mota";
/** "diogomota.com": the name on the left of every top bar. */
export const siteDomain = siteUrl.hostname;
export const siteDescription = "diogo mota, devops engineer @ Richemont, currently based in Lisbon, PT.";

// Open Graph fields shared by every page. Next.js merges metadata shallowly, so a
// page that sets its own openGraph has to spread these back in.
export const baseOpenGraph = {
  siteName,
  type: "website",
  locale: "en_US",
} satisfies Metadata["openGraph"];

// The public pages are black, and so is the browser UI around them.
export const siteViewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};
