import type { Viewport } from "next";

// The apps, in display order, folder by folder. Adding an app is one entry
// here and its place in a folder (below), plus its logo in public/logos, its
// route under app/, its views in lib/app-views.ts and its preview on the front
// page (components/site/AppPreview.tsx).
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
    // Its logo is still shared.svg, from when the app was called Shared (at /shared, which redirects here).
    name: "Calendar",
    href: "/calendar",
    description: "Shared calendar for couples",
    summary: "a calendar for two",
    logo: "/logos/shared.svg",
  },
  {
    name: "Tasks",
    href: "/tasks",
    description: "Shared task lists for couples",
    summary: "task lists for two",
    logo: "/logos/tasks.svg",
  },
  {
    name: "Recipes",
    href: "/recipes",
    description: "Save the recipes you cook together, and shop from one list",
    summary: "a recipe box with a shopping list for two",
    logo: "/logos/recipes.svg",
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
    name: "Fitness",
    href: "/fitness",
    description: "Plan workouts and track fitness, hydration, and body weight",
    summary: "a workout and health tracker",
    logo: "/logos/fitness.svg",
  },
];

export type FolderId = "couples" | "trackers" | "health";

/** A folder of apps: on home, logged in (components/site/AppFolders.tsx), and the front page's groups (AppSections). */
export type AppFolder = {
  id: FolderId;
  title: string;
  /** Its apps, by href, in their order. */
  apps: readonly AppInfo["href"][];
  /** Only the group's two people see what is in it: a lock on its folder on home. */
  private: boolean;
};

// Every app is in one folder (test/home-and-ux.test.ts), in the order of apps.
export const folders: readonly AppFolder[] = [
  { id: "couples", title: "For Couples", apps: ["/calendar", "/tasks", "/recipes"], private: true },
  { id: "trackers", title: "Trackers", apps: ["/shows", "/books"], private: false },
  { id: "health", title: "Health", apps: ["/fitness"], private: false },
];

/** A folder's apps, in its order. */
export const appsOf = (folder: AppFolder): AppInfo[] =>
  folder.apps.map((href) => apps.find((app) => app.href === href)!);

/** "Calendar, Tasks, and Recipes". */
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
