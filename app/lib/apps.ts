import type { Viewport } from "next";

// The apps on home, in display order. Adding an app is one entry here, plus its
// logo in public/logos, its route under app/, its views in lib/app-views.ts and
// its place in a group on the front page (components/site/AppSections.tsx).
export type AppInfo = {
  name: string;
  /** Where the app lives. */
  href: `/${string}`;
  /** One sentence: what it is, under its icon on home (for screen readers) and in its login prompt. */
  description: string;
  /** What it is in a few words, lowercase, for /about's line: "a watchlist with your friends". */
  summary: string;
  /** Square image in public/logos: an app icon with its own colored tile, shown at 56x56. */
  logo: `/logos/${string}`;
};

export const apps: readonly AppInfo[] = [
  {
    // Its address is still /shared, from when the app was called Shared.
    name: "Calendar",
    href: "/shared",
    description: "Shared calendar for couples",
    summary: "events and task lists for two",
    logo: "/logos/shared.svg",
  },
  {
    name: "Shows",
    href: "/shows",
    description: "Track TV shows and movies with your friends",
    summary: "a watchlist with your friends",
    logo: "/logos/shows.svg",
  },
  {
    name: "Books",
    href: "/books",
    description: "Organize your books and track your reading.",
    summary: "a bookshelf and reading tracker",
    logo: "/logos/books.svg",
  },
  {
    name: "Recipes",
    href: "/recipes",
    description: "Save and organise recipes you want to cook again",
    summary: "a recipe box with a shopping list",
    logo: "/logos/recipes.svg",
  },
  {
    name: "Fitness",
    href: "/fitness",
    description: "Plan workouts and track fitness, hydration, and body weight",
    summary: "a workout and health tracker",
    logo: "/logos/fitness.svg",
  },
];

/** "Calendar, Shows, and Recipes". */
export const appNames = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));

/** The id of an app's place on the front page, and of its link there: "shows" (/#shows). */
export const appSlug = (app: AppInfo) => app.href.slice(1);

/** The app a path is in (its page, or a page under it), if any: where `next` goes. */
export function appAt(path: string | null | undefined): AppInfo | undefined {
  return path ? apps.find((app) => path === app.href || path.startsWith(`${app.href}/`)) : undefined;
}

// Viewport of the app pages: edge to edge on phones with a notch or home
// indicator, so the app shell can keep its bars clear of them itself
// (env(safe-area-inset-*)). The theme color comes from the shell.
export const appViewport: Viewport = { viewportFit: "cover" };
