"use client";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAppView } from "@/hooks/useAppView";
import { apiRequest, type ApiError } from "@/lib/api-request";
import { titleKey, type MediaType, type TitleSummary } from "@/lib/show-types";

/** Calls /api/shows{path} and returns its data, or throws an ApiError with its message. */
export function showsRequest<T>(
  path: string,
  options: { method?: string; body?: object; signal?: AbortSignal } = {},
): Promise<T> {
  return apiRequest<T>(`/api/shows${path}`, { ...options, fallback: "Something went wrong. Try again." });
}

/** The query key of a GET of /api/shows{path} (TanStack Query, components/common/QueryProvider). */
export const showsKey = (path: string) => ["shows", path] as const;

/**
 * Makes the answers of the paths that pass `test` load again when next shown,
 * e.g. Added by Friends after a friendship changed.
 */
export function forgetShowsData(client: QueryClient, test: (path: string) => boolean) {
  void client.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "shows" && typeof query.queryKey[1] === "string" && test(query.queryKey[1]),
  });
}

/**
 * GETs /api/shows{path} (nothing while it is null). With `reuse`, an answer this
 * page already loaded for the same path is shown at once, and loaded again only
 * after `staleMs` (Discover's lists change slowly); without, it loads every time
 * it is asked for.
 */
export function useShowsData<T>(path: string | null, reuse = true, staleMs = 10 * 60 * 1000) {
  const query = useQuery({
    queryKey: showsKey(path ?? ""),
    queryFn: ({ signal }) => showsRequest<T>(path!, { signal }),
    enabled: path !== null,
    staleTime: reuse ? staleMs : 0,
    gcTime: reuse ? 30 * 60 * 1000 : 0,
    refetchOnWindowFocus: !reuse,
    retry: false,
  });
  const error = query.data === undefined && query.error ? query.error.message : undefined;
  return {
    data: path === null ? undefined : query.data,
    error,
    /** The HTTP status of the error (0: the server couldn't be reached). */
    errorStatus: error === undefined ? undefined : (query.error as ApiError | null)?.status,
    loading: path !== null && query.data === undefined && !error,
    retry: () => void query.refetch(),
  };
}

/** `value`, once it has stayed the same for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// The cards' titles by key, so a detail panel can show what the card showed
// while it loads the rest.
const seen = new Map<string, TitleSummary>();
export const seenTitle = (key: string) => seen.get(key);

/** Opens a title's detail panel (panel id "title:tv:123"). */
export function useOpenTitle() {
  const { openPanel } = useAppView();
  return (title: TitleSummary) => {
    seen.set(titleKey(title), title);
    openPanel(`title:${titleKey(title)}`);
  };
}

/** The query client, for forgetShowsData. */
export const useShowsClient = useQueryClient;

// The TV Shows | Movies switch of Library and of Discover, each remembered on
// this device (in memory too, where the browser keeps no storage).
const typeEvent = "shows-type-change";
const typesInMemory = new Map<string, MediaType>();
function readType(key: string): MediaType {
  try {
    const stored = localStorage.getItem(`shows-type:${key}`);
    if (stored === "tv" || stored === "movie") return stored;
  } catch {}
  return typesInMemory.get(key) ?? "tv";
}
function subscribeType(onChange: () => void) {
  window.addEventListener(typeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(typeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** A view's TV Shows | Movies choice, remembered on this device; TV Shows the first time. */
export function useRememberedType(key: string): [MediaType, (type: MediaType) => void] {
  const type = useSyncExternalStore(
    subscribeType,
    () => readType(key),
    () => "tv" as MediaType,
  );
  const setType = (next: MediaType) => {
    typesInMemory.set(key, next);
    try {
      localStorage.setItem(`shows-type:${key}`, next);
    } catch {}
    window.dispatchEvent(new Event(typeEvent));
  };
  return [type, setType];
}
