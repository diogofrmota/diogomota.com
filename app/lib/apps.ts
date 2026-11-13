import type { Viewport } from "next";

// The apps listed on /apps, in display order. Adding an app is one entry here,
// plus its logo in public/logos and its route under app/.
export type AppInfo = {
  name: string;
  /** Where the app lives. */
  href: `/${string}`;
  /** One sentence for its card on /apps. */
  description: string;
  /** Square SVG in public/logos: an app icon with its own colored tile, shown at 56x56. */
  logo: `/logos/${string}.svg`;
};

export const apps: readonly AppInfo[] = [
  {
    name: "Shared",
    href: "/shared",
    description: "Shared calendar for couples",
    logo: "/logos/shared.svg",
  },
  {
    name: "Shows",
    href: "/shows",
    description: "Track TV shows and movies with your friends",
    logo: "/logos/shows.svg",
  },
];

/** "Shared and Shows". */
export const appNames = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));
/** What /apps is, for its description and the web app manifest. */
export const appsDescription = `Small apps for friends: ${appNames}.`;

/** The app a path is in (its page, or a page under it), if any: where `next` goes. */
export function appAt(path: string | null | undefined): AppInfo | undefined {
  return path ? apps.find((app) => path === app.href || path.startsWith(`${app.href}/`)) : undefined;
}

// Viewport of the app pages: edge to edge on phones with a notch or home
// indicator, so the app shell can keep its bars clear of them itself
// (env(safe-area-inset-*)). The theme color comes from the shell.
export const appViewport: Viewport = { viewportFit: "cover" };
