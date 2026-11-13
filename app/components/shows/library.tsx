"use client";
import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { Alert } from "@/components/common/ui";
import { ApiError } from "@/lib/api-request";
import {
  type LibraryChange,
  type LibraryItem,
  type LibraryStatus,
  type TitleDetail,
  type TitleSummary,
} from "@/lib/show-types";
import { forgetShowsData, showsKey, showsRequest } from "./shows-data";

type TitleRef = Pick<TitleSummary, "type" | "tmdbId">;
const entryPath = (title: TitleRef) => `/library/${title.type}/${title.tmdbId}`;
const same = (a: TitleRef, b: TitleRef) => a.type === b.type && a.tmdbId === b.tmdbId;

export const libraryKey = showsKey("/library");
const changeKey = ["shows", "library-change"] as const;
const addKey = ["shows", "library-add"] as const;
// Adds and changes go one at a time, in the order they were made (adding a
// title back right after removing it works), so the server applies them in
// that order as well.
const scope = { id: "shows-library" };

// A change to an entry of the library, as plain data: it can wait in this
// browser for the connection (components/common/QueryProvider) and be sent
// after a reload. It must do nothing when the title is gone, and be safe to repeat.
type Change = { kind: "change"; title: TitleRef; fields: LibraryChange } | { kind: "remove"; title: TitleRef };

// Changed titles go first, as the server lists them (latest change first).
function applyChange(items: LibraryItem[], change: Change): LibraryItem[] {
  const item = items.find((i) => same(i, change.title));
  if (!item) return items;
  if (change.kind === "remove") return items.filter((i) => i !== item);
  return [{ ...item, library: { ...item.library, ...change.fields } }, ...items.filter((i) => i !== item)];
}

// Discover's For You is made from the library: once it changes, it loads again when next shown.
const forgetForYou = (client: QueryClient) => forgetShowsData(client, (path) => path.endsWith("/for-you"));

/**
 * Registers how library changes are sent (QueryProvider's setup), so the ones
 * kept from before a reload go out too. Once the server has one, it is applied to
 * what it last sent; one it refused is dropped, which undoes it on screen, and
 * the library loads again after a 404 or 409 (a title removed in another tab).
 */
export function setupShows(client: QueryClient) {
  client.setMutationDefaults(changeKey, {
    mutationFn: (change: Change) =>
      showsRequest(entryPath(change.title), {
        method: change.kind === "change" ? "PATCH" : "DELETE",
        body: change.kind === "change" ? change.fields : undefined,
      }),
    scope,
    onSuccess: async (_data, change) => {
      await client.cancelQueries({ queryKey: libraryKey });
      client.setQueryData<LibraryItem[]>(libraryKey, (items) => items && applyChange(items, change));
      forgetForYou(client);
    },
    onError: (error) => {
      if (error instanceof ApiError && [404, 409].includes(error.status))
        void client.invalidateQueries({ queryKey: libraryKey });
    },
  });
}

export type Library = {
  /** The user's library, latest change first; null until it has loaded. */
  items: LibraryItem[] | null;
  /** Why the last load failed ("" once one works), also while items kept from before are shown. */
  loadError: string;
  /** Whether it has loaded (or failed to) since the app opened: items until then may be the ones kept from before. */
  checked: boolean;
  /** Why the last refused change was undone. */
  error: string;
  dismissError: () => void;
  reload: () => void;
  find: (title: TitleRef) => LibraryItem | undefined;
  /** Adds a title; rejects with the error message if the server refuses. */
  add: (title: TitleRef, status: LibraryStatus) => Promise<void>;
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
// shown is the last state the server sent with the changes not yet confirmed
// (those waiting for the connection too) applied on top. It loads with the app,
// and again when the page is shown again, for changes made on another device;
// it is kept in this browser for offline use.
export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: libraryKey,
    queryFn: ({ signal }) => showsRequest<LibraryItem[]>("/library", { signal }),
    meta: { persist: true },
  });
  const pending = useMutationState({
    filters: { mutationKey: changeKey, status: "pending" },
    select: (mutation) => mutation.state.variables as Change,
  });
  const refused = useMutationState({
    filters: { mutationKey: changeKey, status: "error" },
    select: (mutation) => ({
      at: mutation.state.submittedAt,
      message: (mutation.state.error as Error | null)?.message,
    }),
  }).at(-1);
  const [dismissedAt, setDismissedAt] = useState(0);
  const error = refused && refused.at >= dismissedAt ? `${refused.message} Your change was undone.` : "";
  const { mutate } = useMutation<unknown, Error, Change>({ mutationKey: changeKey });
  const { mutateAsync: addTitle } = useMutation<TitleDetail, Error, { title: TitleRef; status: LibraryStatus }>({
    mutationKey: addKey,
    scope,
    mutationFn: ({ title, status }) =>
      showsRequest<TitleDetail>("/library", {
        method: "POST",
        body: { type: title.type, tmdbId: title.tmdbId, status },
      }),
  });

  const items = useMemo(() => query.data && pending.reduce(applyChange, query.data), [query.data, pending]);

  const library = useMemo<Library>(
    () => ({
      items: items ?? null,
      // Also with a library kept from before (it may be out of date), which stays shown.
      loadError: query.error?.message ?? "",
      // Not only isFetchedAfterMount, which restoring the kept library also sets: the load that follows has to be done.
      checked: query.isFetchedAfterMount && !query.isFetching,
      error,
      dismissError: () => setDismissedAt(Date.now()),
      reload: () => void client.invalidateQueries({ queryKey: libraryKey }),
      find: (title) => items?.find((item) => same(item, title)),
      add: async (title, status) => {
        try {
          const detail = await addTitle({ title, status });
          const item: LibraryItem = {
            type: detail.type,
            tmdbId: detail.tmdbId,
            title: detail.title,
            year: detail.year,
            posterPath: detail.posterPath,
            rating: detail.rating,
            runtime: detail.runtime,
            episodeRuntime: detail.episodeRuntime,
            episodesPerSeason: detail.episodesPerSeason,
            library: detail.library!,
          };
          // Not loaded yet (it failed): load it, with the new title.
          if (client.getQueryData(libraryKey))
            client.setQueryData<LibraryItem[]>(
              libraryKey,
              (current) => current && [item, ...current.filter((i) => !same(i, item))],
            );
          else void client.invalidateQueries({ queryKey: libraryKey });
          forgetForYou(client);
          setDismissedAt(Date.now());
        } catch (err) {
          // Already there (added in another tab or device): load the library again to show it.
          if (err instanceof ApiError && err.status === 409) void client.invalidateQueries({ queryKey: libraryKey });
          throw err;
        }
      },
      change: (title, fields) => {
        setDismissedAt(Date.now());
        mutate({ kind: "change", title, fields });
      },
      remove: (title) => {
        setDismissedAt(Date.now());
        mutate({ kind: "remove", title });
      },
    }),
    [items, query.error, query.isFetchedAfterMount, query.isFetching, error, client, addTitle, mutate],
  );

  return <LibraryContext value={library}>{children}</LibraryContext>;
}

/** The last refused change, with a button to dismiss it. */
export function ChangeError({ className }: { className: string }) {
  const { error, dismissError } = useLibrary();
  if (!error) return null;
  return (
    <Alert className={className} onDismiss={dismissError}>
      {error}
    </Alert>
  );
}
