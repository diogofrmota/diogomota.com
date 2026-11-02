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
    description: "A private space to share a calendar and task lists.",
    logo: "/logos/shared.svg",
  },
  {
    name: "Shows",
    href: "/shows",
    description: "Track the TV shows and movies you watch.",
    logo: "/logos/shows.svg",
  },
];

// Viewport of the app pages: edge to edge on phones with a notch or home
// indicator, so the app shell can keep its bars clear of them itself
// (env(safe-area-inset-*)). The theme color comes from the shell.
export const appViewport: Viewport = { viewportFit: "cover" };
