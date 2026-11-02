"use client";

import { usePathname } from "next/navigation";
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

// In-app navigation for the SPAs (/shared, /shows). The URL stays at the app's
// path; which view is showing, and which modals or panels are open, is React
// state. Every change is also a browser history entry (history.pushState), so
// the back button moves to the previous view and closes panels, and forward
// redoes it. A page load, reload included, starts on the default view, as
// rendered by the server.
//
// Each entry keeps that state under KEY in history.state, next to the Next.js
// router's own keys (its patched pushState copies them over). After a refresh,
// such as a server action that revalidates, Next.js replaces the current entry's
// state with only its own keys, so the current entry is stamped again after
// every render and before every push.

const KEY = "appView";

export type AppViewState = {
  /** Id of the view (tab) that is showing. */
  view: string;
  /** Ids of the open modals and panels, bottom to top. */
  panels: readonly string[];
};

export type AppView = AppViewState & {
  /** Shows a view, closing any open panels. */
  setView: (view: string) => void;
  /** Opens a panel on top of the current view and any open panels. */
  openPanel: (panel: string) => void;
  /** Closes the top panel, the same as pressing back. */
  closePanel: () => void;
};

function sameState(a: AppViewState, b: AppViewState): boolean {
  return (
    a.view === b.view &&
    a.panels.length === b.panels.length &&
    a.panels.every((panel, index) => panel === b.panels[index])
  );
}

// The app state saved in a history entry, or null if it has none for these views.
function savedState(historyState: unknown, views: readonly string[]): AppViewState | null {
  const saved = (historyState as Record<string, unknown> | null)?.[KEY] as
    | { view?: unknown; panels?: unknown }
    | undefined;
  if (typeof saved?.view !== "string" || !views.includes(saved.view)) return null;
  if (!Array.isArray(saved.panels)) return null;
  return {
    view: saved.view,
    panels: saved.panels.filter((panel): panel is string => typeof panel === "string"),
  };
}

function writeState(state: AppViewState, mode: "push" | "replace") {
  const entry = { ...window.history.state, [KEY]: state };
  if (mode === "push") window.history.pushState(entry, "");
  else window.history.replaceState(entry, "");
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

/** The navigation state of an app with these views; the first is the default. Used by AppShell. */
export function useAppViewHistory(views: readonly string[]): AppView {
  const pathname = usePathname();
  // True only while hydrating the server-rendered page.
  const hydrating = useSyncExternalStore(
    subscribeNever,
    () => false,
    () => true,
  );
  const [state, setState] = useState<AppViewState>(() => {
    // A page load starts on the default view, as rendered by the server. Coming
    // back to the app with back or forward resumes the view of that entry.
    const saved = hydrating ? null : savedState(window.history.state, views);
    return { view: saved?.view ?? views[0], panels: [] };
  });
  // The newest state, for event handlers that run before React re-renders.
  const latest = useRef(state);
  // Set between closePanel's history.back() and the popstate it causes.
  const closing = useRef(false);
  // Set until the first check for a back or forward during page load (below).
  const checkLoad = useRef(hydrating);

  // Declared before the effect that stamps the current entry, so that a missed
  // back or forward is applied before the default view could be stamped over it.
  useEffect(() => {
    function restore(historyState: unknown) {
      // Back out of the app: the Next.js router takes it from here.
      if (window.location.pathname !== pathname) return;
      closing.current = false;
      // An entry without saved state (replaced by Next.js) keeps the view.
      latest.current = savedState(historyState, views) ?? { view: latest.current.view, panels: [] };
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
  }, [pathname, views]);

  // Keeps the current entry in step with the state (see the top of this file).
  useEffect(() => {
    if (closing.current || window.location.pathname !== pathname) return;
    const saved = savedState(window.history.state, views);
    if (!saved || !sameState(saved, latest.current)) writeState(latest.current, "replace");
  });

  const go = useCallback((next: AppViewState, mode: "push" | "replace") => {
    // Stamps the entry being left first, in case Next.js replaced its state.
    if (mode === "push") writeState(latest.current, "replace");
    writeState(next, mode);
    latest.current = next;
    setState(next);
  }, []);

  const setView = useCallback(
    (view: string) => {
      const current = latest.current;
      if (closing.current || !views.includes(view)) return;
      if (view === current.view && current.panels.length === 0) return;
      // With panels open, their entry is replaced: back from the new view goes
      // to the view under them, rather than reopening them.
      go({ view, panels: [] }, current.panels.length > 0 ? "replace" : "push");
    },
    [go, views],
  );

  const openPanel = useCallback(
    (panel: string) => {
      const { view, panels } = latest.current;
      if (closing.current || panels[panels.length - 1] === panel) return;
      go({ view, panels: [...panels, panel] }, "push");
    },
    [go],
  );

  const closePanel = useCallback(() => {
    // Each panel was pushed on top of the entry without it, so going back
    // closes it; popstate then updates the state.
    if (closing.current || latest.current.panels.length === 0) return;
    closing.current = true;
    window.history.back();
  }, []);

  return useMemo(
    () => ({ ...state, setView, openPanel, closePanel }),
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
