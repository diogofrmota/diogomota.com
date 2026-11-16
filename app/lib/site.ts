import type { Metadata } from "next";
import { appNames } from "./apps";

export const siteUrl = new URL("https://diogomota.com");
export const siteName = "diogo mota";
/** "diogomota.com": the name on the left of every top bar. */
export const siteDomain = siteUrl.hostname;
/** What the site is, in a line: the front page's headline. */
export const siteTagline = "Small apps to share with friends";
/** The front page's introduction, under the headline. */
export const siteLead = "A shared calendar and task list, a watchlist for your shows and much more!";
/** What the site is, with its apps (home, the web app manifest, and every page without its own description). */
export const siteDescription = `${siteTagline}: ${appNames}.`;
/** Who runs it: /about. */
export const aboutDescription = "Diogo Mota, DevOps engineer at Richemont, based in Lisbon, Portugal.";

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
