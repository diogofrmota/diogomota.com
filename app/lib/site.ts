import type { Metadata } from "next";
import { appNames } from "./apps";

export const siteUrl = new URL("https://diogomota.com");
export const siteName = "diogo mota";
/** What the site is, in a line: the front page's headline. */
export const siteTagline = "Small apps to share with friends";
/** The front page's introduction, under the headline. */
export const siteLead = "Shared calendar, Fitness app and Shows Tracker!";
/** What the site is, with its apps (home, the web app manifest, and every page without its own description). */
export const siteDescription = `${siteTagline}: ${appNames}.`;
/** Who runs it: /about. */
export const aboutDescription = "Diogo Mota, DevOps engineer based in Lisbon, Portugal.";

/**
 * Where /about's Get in touch form and /report-bug send their messages:
 * CONTACT_EMAIL, set where it runs (.env.production.example). Never shown on a
 * page. Unset, /about has no form, /report-bug says it can't take reports, and
 * Privacy says to ask Diogo.
 */
export const contactEmail = (): string | null => process.env.CONTACT_EMAIL?.trim() || null;

/** The longest message Get in touch or Report a bug sends. */
export const CONTACT_MESSAGE_MAX = 5000;

// Open Graph fields shared by every page. Next.js merges metadata shallowly, so a
// page that sets its own openGraph has to spread these back in.
export const baseOpenGraph = {
  siteName,
  type: "website",
  locale: "en_US",
} satisfies Metadata["openGraph"];
