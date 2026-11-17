import type { Viewport } from "next";

// The apps on home, in display order. Adding an app is one entry here, plus its
// logo in public/logos, its route under app/ and its views in lib/app-views.ts.
export type AppInfo = {
  name: string;
  /** Where the app lives. */
  href: `/${string}`;
  /** One sentence: what it is, under its icon on home (for screen readers) and in its login prompt. */
  description: string;
  /** What it is in a few words, lowercase, for the front page's line: "a calendar for two". */
  summary: string;
  /** Its section's headline on the front page (home, logged out). */
  tagline: string;
  /** What it does, a short line each, in its section on the front page. */
  features: readonly string[];
  /** Square SVG in public/logos: an app icon with its own colored tile, shown at 56x56. */
  logo: `/logos/${string}.svg`;
};

export const apps: readonly AppInfo[] = [
  {
    name: "Shared",
    href: "/shared",
    description: "Shared calendar for couples",
    summary: "a calendar for two",
    tagline: "One calendar for the two of you",
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
    summary: "a watchlist with your friends",
    tagline: "Know what your friends are watching",
    features: [
      "Your TV shows and movies, and where you are in each",
      "Discover what's popular and what friends recommend",
      "See what your friends are watching",
    ],
    logo: "/logos/shows.svg",
  },
  {
    name: "Recipes",
    href: "/recipes",
    description: "Save and organise recipes you want to cook again",
    summary: "a recipe box with a shopping list",
    tagline: "The recipes you want to cook again",
    features: [
      "Ingredients, steps, photos and where each recipe came from",
      "Tags and search, and any recipe scaled to how many you're cooking for",
      "A shopping list from a recipe's ingredients, and your favourites a tap away",
    ],
    logo: "/logos/recipes.svg",
  },
  {
    name: "Fitness",
    href: "/fitness",
    description: "Plan workouts and track fitness, hydration, and body weight",
    summary: "a workout and health tracker",
    tagline: "Every workout, run and glass of water",
    features: [
      "Gym routines, and each set's reps and weight logged as you lift",
      "Runs, daily steps, body weight, water and supplements, day by day",
      "Your history, your progress over time and your personal records",
    ],
    logo: "/logos/fitness.svg",
  },
];

/** "Shared, Shows, and Recipes". */
export const appNames = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));

/** The id of an app's section on the front page, and of its link there: "shared" (/#shared). */
export const appSlug = (app: AppInfo) => app.href.slice(1);

/** The app a path is in (its page, or a page under it), if any: where `next` goes. */
export function appAt(path: string | null | undefined): AppInfo | undefined {
  return path ? apps.find((app) => path === app.href || path.startsWith(`${app.href}/`)) : undefined;
}

// Viewport of the app pages: edge to edge on phones with a notch or home
// indicator, so the app shell can keep its bars clear of them itself
// (env(safe-area-inset-*)). The theme color comes from the shell.
export const appViewport: Viewport = { viewportFit: "cover" };
