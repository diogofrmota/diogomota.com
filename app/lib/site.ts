import type { Metadata, Viewport } from "next";
import { appsDescription } from "./apps";

export const siteUrl = new URL("https://diogomota.com");
export const siteName = "diogo mota";
/** "diogomota.com": the name on the left of every top bar. */
export const siteDomain = siteUrl.hostname;
/** What the site is: its apps (home, and every page without its own description). */
export const siteDescription = appsDescription;
/** Who runs it: /about. */
export const aboutDescription = "diogo mota, devops engineer @ Richemont, currently based in Lisbon, PT.";

/**
 * Where to write to about the site (Privacy): CONTACT_EMAIL, set where it runs
 * (.env.production.example). Unset, Privacy says to ask Diogo, without a link.
 */
export const contactEmail = (): string | null => process.env.CONTACT_EMAIL?.trim() || null;

// Open Graph fields shared by every page. Next.js merges metadata shallowly, so a
// page that sets its own openGraph has to spread these back in.
export const baseOpenGraph = {
  siteName,
  type: "website",
  locale: "en_US",
} satisfies Metadata["openGraph"];

// /about is black, and so is the browser UI around it.
export const siteViewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};
