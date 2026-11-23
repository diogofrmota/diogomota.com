"use client";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useAppView } from "@/hooks/useAppView";

// A panel asking for another to open in its place once it has closed: a new
// recipe's page after its form (Recipes), a workout after Start a workout
// (Fitness). The app wraps its AppShell in OpenAfterCloseProvider, its panels
// call useOpenQueuedPanel, and the asking panel useOpenAfterClose.

type AfterClose = {
  open: (panel: string) => void;
  /** The panel asked for, taken off the queue, once `top` isn't the one that asked any more. */
  take: (top: string | undefined) => string | null;
};

const AfterCloseContext = createContext<AfterClose | null>(null);

export function OpenAfterCloseProvider({ children }: { children: React.ReactNode }) {
  const queued = useRef<{ panel: string; after: string | undefined } | null>(null);
  const value = useMemo<AfterClose>(
    () => ({
      // The panel on top when it was asked: the one that is closing. Read from
      // the URL, as AppShell's state is inside it, below this.
      open: (panel) => {
        queued.current = { panel, after: new URLSearchParams(window.location.search).getAll("p").at(-1) };
      },
      take: (top) => {
        const next = queued.current;
        if (!next || top === next.after) return null;
        queued.current = null;
        return next.panel;
      },
    }),
    [],
  );
  return <AfterCloseContext value={value}>{children}</AfterCloseContext>;
}

const nothing = () => {};

/** Opens `panel` once the panel on top now has closed (nothing, outside an OpenAfterCloseProvider). */
export function useOpenAfterClose(): (panel: string) => void {
  return useContext(AfterCloseContext)?.open ?? nothing;
}

/** In an app's panels (inside its AppShell): opens what was asked for, once the panel that asked has closed. */
export function useOpenQueuedPanel() {
  const { panels, openPanel } = useAppView();
  const take = useContext(AfterCloseContext)?.take;
  const top = panels.at(-1);
  useEffect(() => {
    const next = take?.(top);
    if (next) openPanel(next);
  }, [top, openPanel, take]);
}
