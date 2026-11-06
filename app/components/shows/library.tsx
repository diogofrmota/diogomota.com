"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api-request";
import { type LibraryChange, type LibraryItem, type LibraryStatus, type TitleDetail, type TitleSummary } from "@/lib/show-types";
import { forgetShowsData, showsRequest } from "./shows-data";

// Discover's For You is made from the library: once it changes, it loads again
// when next shown.
const forgetForYou = () => forgetShowsData((path) => path.endsWith("/for-you"));

type TitleRef = Pick<TitleSummary, "type" | "tmdbId">;
const entryPath = (title: TitleRef) => `/library/${title.type}/${title.tmdbId}`;
const same = (a: TitleRef, b: TitleRef) => a.type === b.type && a.tmdbId === b.tmdbId;

// A change shows at once, and is sent once every change before it is done.
// apply() must do nothing when the title is gone, and be safe to repeat.
type Change = { apply: (items: LibraryItem[]) => LibraryItem[]; send: () => Promise<unknown> };

// Changed titles go first, as the server lists them (latest change first).
function changed(items: LibraryItem[], title: TitleRef, fields: LibraryChange): LibraryItem[] {
  const item = items.find((i) => same(i, title));
  if (!item) return items;
  return [{ ...item, library: { ...item.library, ...fields } }, ...items.filter((i) => i !== item)];
}

export type Library = {
  /** The user's library, latest change first; null until it has loaded. */
  items: LibraryItem[] | null;
  loadError: string;
  /** Why the last refused change was undone. */
  error: string;
  dismissError: () => void;
  reload: () => void;
  find: (title: TitleRef) => LibraryItem | undefined;
  /** Adds a title; rejects with the error message if the server refuses. */
  add: (title: TitleRef, status: Extract<LibraryStatus, "watching" | "planned">) => Promise<void>;
  change: (title: TitleRef, fields: LibraryChange) => void;
  remove: (title: TitleRef) => void;
};

const LibraryContext = createContext<Library | null>(null);

export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (!library) throw new Error("useLibrary must be used inside a LibraryProvider");
  return library;
}

// The user's library for the whole Shows app, with optimistic updates: what is
// shown is the last state the server confirmed with the pending changes applied
// on top, and a change the server refuses is dropped, which rolls it back.
// Requests go one at a time in the order they were made (adds too, so adding a
// title back right after removing it works), so the server applies them in that
// order as well.
export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [confirmed, setConfirmed] = useState<LibraryItem[] | null>(null);
  const [pending, setPending] = useState<Change[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const queue = useRef<Promise<unknown>>(null);
  const loaded = useRef(false);

  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = (queue.current ?? Promise.resolve()).then(job);
    queue.current = run.catch(() => {});
    return run;
  }, []);
  const reload = useCallback(() => void enqueue(async () => {
    try { setConfirmed(await showsRequest<LibraryItem[]>("/library")); setLoadError(""); loaded.current = true; }
    catch (err) { setLoadError((err as Error).message); }
  }), [enqueue]);
  const send = useCallback((next: Change) => {
    setError("");
    setPending((current) => [...current, next]);
    void enqueue(async () => {
      try {
        await next.send();
        setConfirmed((items) => items && next.apply(items));
        forgetForYou();
      } catch (err) {
        setError(`${(err as Error).message} Your change was undone.`);
        // Changed or removed elsewhere meanwhile (another tab or device): show what is there now.
        if (err instanceof ApiError && [404, 409].includes(err.status)) reload();
      } finally {
        setPending((current) => current.filter((c) => c !== next));
      }
    });
  }, [enqueue, reload]);

  // Loaded with the app; again when the page is shown again, for changes made on another device.
  useEffect(() => {
    reload();
    const onShow = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [reload]);

  const items = useMemo(() => confirmed && pending.reduce((current, c) => c.apply(current), confirmed), [confirmed, pending]);

  const library = useMemo<Library>(() => ({
    items, loadError, error,
    dismissError: () => setError(""),
    reload,
    find: (title) => items?.find((item) => same(item, title)),
    add: (title, status) => enqueue(async () => {
      try {
        const detail = await showsRequest<TitleDetail>("/library", { method: "POST", body: { type: title.type, tmdbId: title.tmdbId, status } });
        const item: LibraryItem = { type: detail.type, tmdbId: detail.tmdbId, title: detail.title, year: detail.year,
          posterPath: detail.posterPath, rating: detail.rating, runtime: detail.runtime, episodeRuntime: detail.episodeRuntime,
          episodesPerSeason: detail.episodesPerSeason, library: detail.library! };
        // Not loaded yet (it failed): load it, with the new title.
        if (loaded.current) setConfirmed((current) => current && [item, ...current.filter((i) => !same(i, item))]);
        else reload();
        forgetForYou();
        setError("");
      } catch (err) {
        // Already there (added in another tab or device): load the library again to show it.
        if (err instanceof ApiError && err.status === 409) reload();
        throw err;
      }
    }),
    change: (title, fields) => send({
      apply: (current) => changed(current, title, fields),
      send: () => showsRequest(entryPath(title), { method: "PATCH", body: fields }),
    }),
    remove: (title) => send({
      apply: (current) => current.filter((item) => !same(item, title)),
      send: () => showsRequest(entryPath(title), { method: "DELETE" }),
    }),
  }), [items, loadError, error, reload, enqueue, send]);

  return <LibraryContext value={library}>{children}</LibraryContext>;
}

/** The last refused change, with a button to dismiss it. */
export function ChangeError({ className }: { className: string }) {
  const { error, dismissError } = useLibrary();
  if (!error) return null;
  return <div role="alert" className={className}>
    <p>{error}</p>
    <button type="button" onClick={dismissError}>Dismiss</button>
  </div>;
}
