import type { Viewport } from "next";

// The apps listed on /apps, in display order. Adding an app is one entry here,
// plus its logo in public/logos and its route under app/.
export type AppInfo = {
  name: string;
  /** Where the app lives. */
  href: `/${string}`;
  /** One sentence for its card on /apps. */
  description: string;
  /** Square SVG in public/logos, shown at 48x48 on a black background. */
  logo: `/logos/${string}.svg`;
};

export const apps: readonly AppInfo[] = [
  {
    name: "Shared",
    href: "/shared",
    description: "Create a shared calendar and task list with someone else.",
    logo: "/logos/shared.svg",
  },
  {
    name: "Shows",
    href: "/shows",
    description: "Track the TV shows and movies you watch.",
    logo: "/logos/shows.svg",
  },
];

/** An app's id in URLs, such as /settings?app=shows: its path without the slash. */
export function appId(app: AppInfo): string {
  return app.href.slice(1);
}

/** The app with this id, or none. */
export function findApp(id: unknown): AppInfo | undefined {
  return apps.find((app) => appId(app) === id);
}

/** Settings (/settings), open on this app's settings (the first app's without one). */
export function settingsHref(app?: AppInfo): string {
  return app ? `/settings?${new URLSearchParams({ app: appId(app) })}` : "/settings";
}

const names = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));
/** What /apps is, for its description and the web app manifest. */
export const appsDescription = `Small apps for friends: ${names}.`;

// Viewport of the app pages: edge to edge on phones with a notch or home
// indicator, so the app shell can keep its bars clear of them itself
// (env(safe-area-inset-*)). The theme color comes from the shell.
export const appViewport: Viewport = { viewportFit: "cover" };
