import type { Viewport } from "next";

// The apps on home, in display order. Adding an app is one entry here, plus its
// logo in public/logos, its route under app/ and its views in lib/app-views.ts.
export type AppInfo = {
  name: string;
  /** Where the app lives. */
  href: `/${string}`;
  /** One sentence: what it is, under its icon on home (for screen readers) and in its login prompt. */
  description: string;
  /** What it does, a short line each, on its card on the front page (home, logged out). */
  features: readonly string[];
  /** Square SVG in public/logos: an app icon with its own colored tile, shown at 56x56. */
  logo: `/logos/${string}.svg`;
};

export const apps: readonly AppInfo[] = [
  {
    name: "Shared",
    href: "/shared",
    description: "Shared calendar for couples",
    features: [
      "A calendar for the two of you, by month or as an agenda",
      "Task lists you both tick off, with repeats and who's doing what",
      "Subscribe to it from Google, Apple or Outlook Calendar",
    ],
    logo: "/logos/shared.svg",
  },
  {
    name: "Shows",
    href: "/shows",
    description: "Track TV shows and movies with your friends",
    features: [
      "Your TV shows and movies, and where you are in each",
      "Discover what's popular and what friends recommend",
      "See what your friends are watching",
    ],
    logo: "/logos/shows.svg",
  },
];

/** "Shared and Shows". */
export const appNames = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));
/** What the site is, for home's description and the web app manifest. */
export const appsDescription = `Small apps for friends: ${appNames}.`;

/** The app a path is in (its page, or a page under it), if any: where `next` goes. */
export function appAt(path: string | null | undefined): AppInfo | undefined {
  return path ? apps.find((app) => path === app.href || path.startsWith(`${app.href}/`)) : undefined;
}

// Viewport of the app pages: edge to edge on phones with a notch or home
// indicator, so the app shell can keep its bars clear of them itself
// (env(safe-area-inset-*)). The theme color comes from the shell.
export const appViewport: Viewport = { viewportFit: "cover" };
