// The views (tabs) of each app, in their order: the first is the app's own path
// (/shows), the others under it (/shows/discover). Shared by the pages, which
// read the URL, and the apps (hooks/useAppView.ts).

export type AppViewState = { view: string; panels: readonly string[] };

export const sharedViews = ["calendar", "tasks", "settings"] as const;
export const showsViews = ["library", "discover", "profile"] as const;

/** At most this many panels are taken from a URL: more is a broken link. */
const maxPanels = 5;

/**
 * The state a page's URL asks for, from its catch-all segment (the view) and
 * its p parameters (the open panels), or null for a path that isn't one of the
 * app's views (a 404).
 */
export function viewFromParams(
  views: readonly string[],
  segments: string[] | undefined,
  panels: string | string[] | undefined,
): AppViewState | null {
  if (segments && segments.length > 1) return null;
  const view = segments?.[0] ?? views[0];
  if (!views.includes(view)) return null;
  return {
    view,
    panels: [panels ?? []]
      .flat()
      .filter((panel) => panel && panel.length <= 200)
      .slice(0, maxPanels),
  };
}

// The view last shown in each app, on this device: a cookie per app, written
// by the app (AppShell) whenever its view changes and read by home, whose icon
// for the app goes straight back to it. Only the view, never the open panels.

/** The cookie of the app at `basePath`: last-view-shared. */
export const lastViewCookieName = (basePath: string) =>
  `last-view-${basePath.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-")}`;

/** The Set-Cookie text (document.cookie) remembering `view` for a year. */
export function lastViewCookie(basePath: string, view: string): string {
  return `${lastViewCookieName(basePath)}=${encodeURIComponent(view)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Where home's icon for an app goes: the view remembered for it, if it is one
 * of the app's views (and not its first, which is the app's own path), else
 * the app's own path.
 */
export function lastViewHref(basePath: string, views: readonly string[], remembered: string | undefined): string {
  return remembered && remembered !== views[0] && views.includes(remembered) ? `${basePath}/${remembered}` : basePath;
}
