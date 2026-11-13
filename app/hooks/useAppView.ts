"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { AppViewState } from "@/lib/app-views";

// In-app navigation for the SPAs (/shared, /shows). Which view is showing, and
// which modals or panels are open, is in the URL: the view is the path after
// the app's (/shows/discover; the app's own path is its first view), and the
// open panels, bottom to top, are its p parameters (?p=search&p=title:tv:1396).
// So a reload keeps them, and any of them can be linked to or bookmarked.
//
// Moving between them never loads a page: every change is a history entry made
// with history.pushState, which Next.js's router takes in (usePathname and
// useSearchParams follow it). Back moves to the previous view and closes
// panels, and forward redoes it. Each entry also keeps the state under KEY in
// history.state, next to the Next.js router's own keys (its patched pushState
// copies them over), with whether Back from it closes its top panel: true for a
// panel opened here, false for one that came with the URL (a link), which
// closes by replacing the entry instead, so closing it never leaves the app.

const KEY = "appView";

/** Which view (tab) is showing, and the ids of the open modals and panels, bottom to top. */
export type { AppViewState };

type Entry = AppViewState & { backCloses: boolean };

export type AppView = AppViewState & {
  /** Shows a view, closing any open panels. */
  setView: (view: string) => void;
  /** Opens a panel on top of the current view and any open panels. */
  openPanel: (panel: string) => void;
  /** Closes the top panel, the same as pressing back. */
  closePanel: () => void;
};

/** At most this many panels are taken from a URL: more is a broken link. */
const maxPanels = 5;

function sameState(a: AppViewState, b: AppViewState): boolean {
  return (
    a.view === b.view &&
    a.panels.length === b.panels.length &&
    a.panels.every((panel, index) => panel === b.panels[index])
  );
}

/** The URL of a state: /shows, /shows/discover, /shows/discover?p=search. */
export function appViewUrl(basePath: string, views: readonly string[], state: AppViewState): string {
  const path = state.view === views[0] ? basePath : `${basePath}/${state.view}`;
  const params = new URLSearchParams();
  for (const panel of state.panels) params.append("p", panel);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * The state a URL of the app shows, from its path (the view; nothing after the
 * app's own path is the first view) and p parameters; null for a path that
 * isn't one of the app's views.
 */
export function appViewFromUrl(
  basePath: string,
  views: readonly string[],
  pathname: string,
  search: string | URLSearchParams,
): AppViewState | null {
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return null;
  const rest = pathname.slice(basePath.length).replace(/^\/+|\/+$/g, "");
  if (rest.includes("/")) return null;
  const view = rest || views[0];
  if (!views.includes(view)) return null;
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const panels = params
    .getAll("p")
    .filter((panel) => panel && panel.length <= 200)
    .slice(0, maxPanels);
  return { view, panels };
}

// The app state saved in a history entry, or null if it has none for these views.
function savedEntry(historyState: unknown, views: readonly string[]): Entry | null {
  const saved = (historyState as Record<string, unknown> | null)?.[KEY] as
    { view?: unknown; panels?: unknown; backCloses?: unknown } | undefined;
  if (typeof saved?.view !== "string" || !views.includes(saved.view)) return null;
  if (!Array.isArray(saved.panels)) return null;
  return {
    view: saved.view,
    panels: saved.panels.filter((panel): panel is string => typeof panel === "string"),
    backCloses: saved.backCloses === true,
  };
}

// Whether the browser is on another history entry than the one this page loaded
// on. Needs the Navigation API (not in every browser yet); without it, assumes not.
function movedSinceLoad(): boolean {
  const { navigation } = window as unknown as {
    navigation?: {
      activation?: { entry?: { key: string } | null } | null;
      currentEntry?: { key: string } | null;
    };
  };
  const loaded = navigation?.activation?.entry;
  const current = navigation?.currentEntry;
  return !!loaded && !!current && loaded.key !== current.key;
}

const subscribeNever = () => () => {};

/**
 * The navigation state of an app at `basePath` with these views (the first is
 * the default), starting from `initial`: what the server rendered for the URL.
 * Used by AppShell.
 */
export function useAppViewHistory(basePath: string, views: readonly string[], initial: AppViewState): AppView {
  // True only while hydrating the server-rendered page.
  const hydrating = useSyncExternalStore(
    subscribeNever,
    () => false,
    () => true,
  );
  const [state, setState] = useState<Entry>(() => {
    // A page load starts on what the server rendered for its URL. Coming back
    // to the app with back or forward resumes that entry's state.
    const saved = hydrating ? null : savedEntry(window.history.state, views);
    return (
      saved ?? {
        view: views.includes(initial.view) ? initial.view : views[0],
        panels: initial.panels,
        backCloses: false,
      }
    );
  });
  // The newest state, for event handlers that run before React re-renders.
  const latest = useRef(state);
  // Set between closePanel's history.back() and the popstate it causes.
  const closing = useRef(false);
  // Set until the first check for a back or forward during page load (below).
  const checkLoad = useRef(hydrating);

  const inApp = useCallback(
    () => window.location.pathname === basePath || window.location.pathname.startsWith(`${basePath}/`),
    [basePath],
  );

  const write = useCallback(
    (entry: Entry, mode: "push" | "replace") => {
      const data = { ...window.history.state, [KEY]: entry };
      const url = appViewUrl(basePath, views, entry);
      if (mode === "push") window.history.pushState(data, "", url);
      else window.history.replaceState(data, "", url);
    },
    [basePath, views],
  );

  // Declared before the effect that stamps the current entry, so that a missed
  // back or forward is applied before the loaded state could be stamped over it.
  useEffect(() => {
    function restore(historyState: unknown) {
      // Back out of the app: the Next.js router takes it from here.
      if (!inApp()) return;
      closing.current = false;
      // An entry without saved state (replaced by Next.js, or reached by a link) is read from its URL.
      const fromUrl = appViewFromUrl(basePath, views, window.location.pathname, window.location.search);
      latest.current = savedEntry(historyState, views) ??
        (fromUrl && { ...fromUrl, backCloses: false }) ?? { view: latest.current.view, panels: [], backCloses: false };
      setState(latest.current);
    }
    const onPopState = (event: PopStateEvent) => restore(event.state);
    window.addEventListener("popstate", onPopState);
    // Back or forward pressed while the page was still loading fired its
    // popstate before there was a listener.
    if (checkLoad.current) {
      checkLoad.current = false;
      if (movedSinceLoad()) restore(window.history.state);
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, [basePath, views, inApp]);

  // Keeps the current entry in step with the state (see the top of this file).
  useEffect(() => {
    if (closing.current || !inApp()) return;
    const saved = savedEntry(window.history.state, views);
    if (!saved || !sameState(saved, latest.current) || saved.backCloses !== latest.current.backCloses)
      write(latest.current, "replace");
  });

  const go = useCallback(
    (next: Entry, mode: "push" | "replace") => {
      // Stamps the entry being left first, in case Next.js replaced its state.
      if (mode === "push") write(latest.current, "replace");
      write(next, mode);
      latest.current = next;
      setState(next);
    },
    [write],
  );

  const setView = useCallback(
    (view: string) => {
      const current = latest.current;
      if (closing.current || !views.includes(view)) return;
      if (view === current.view && current.panels.length === 0) return;
      // With panels open, their entry is replaced: back from the new view goes
      // to the view under them, rather than reopening them.
      go({ view, panels: [], backCloses: false }, current.panels.length > 0 ? "replace" : "push");
    },
    [go, views],
  );

  const openPanel = useCallback(
    (panel: string) => {
      const { view, panels } = latest.current;
      if (closing.current || panels[panels.length - 1] === panel) return;
      go({ view, panels: [...panels, panel], backCloses: true }, "push");
    },
    [go],
  );

  const closePanel = useCallback(() => {
    const current = latest.current;
    if (closing.current || current.panels.length === 0) return;
    // A panel opened here was pushed on top of the entry without it, so going
    // back closes it (popstate then updates the state). One that came with the
    // URL has no such entry under it: its entry is replaced.
    if (current.backCloses) {
      closing.current = true;
      window.history.back();
    } else {
      go({ view: current.view, panels: current.panels.slice(0, -1), backCloses: false }, "replace");
    }
  }, [go]);

  return useMemo(
    () => ({ view: state.view, panels: state.panels, setView, openPanel, closePanel }),
    [state, setView, openPanel, closePanel],
  );
}

export const AppViewContext = createContext<AppView | null>(null);

/** The current view and panels of the AppShell around the caller, and moving between them. */
export function useAppView(): AppView {
  const appView = useContext(AppViewContext);
  if (!appView) throw new Error("useAppView must be used inside an AppShell");
  return appView;
}
