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
