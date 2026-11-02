"use client";
import { useEffect, useState } from "react";
import { useAppView } from "@/hooks/useAppView";
import { apiRequest, type ApiError } from "@/lib/api-request";
import { titleKey, type TitleSummary } from "@/lib/show-types";

/** Calls /api/shows{path} and returns its data, or throws an ApiError with its message. */
export function showsRequest<T>(path: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}): Promise<T> {
  return apiRequest<T>(`/api/shows${path}`, { ...options, fallback: "Something went wrong. Try again." });
}

// Answers already loaded on this page, so switching back to a list or search
// shows it at once. Discover lists change slowly; a reload loads them again.
const loaded = new Map<string, unknown>();
function keep(path: string, data: unknown) {
  if (loaded.size >= 100) loaded.delete(loaded.keys().next().value!);
  loaded.set(path, data);
}

/**
 * Forgets the loaded answers of the paths that pass `test`, e.g. Added by
 * Friends after a friendship changed: they load again when next shown.
 */
export function forgetShowsData(test: (path: string) => boolean) {
  for (const path of loaded.keys()) if (test(path)) loaded.delete(path);
}

/**
 * GETs /api/shows{path} (nothing while it is null). With `reuse`, an answer this
 * page already loaded for the same path is shown at once instead.
 */
export function useShowsData<T>(path: string | null, reuse = true) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string; status?: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (path === null || (reuse && loaded.has(path))) return;
    const controller = new AbortController();
    showsRequest<T>(path, { signal: controller.signal }).then((data) => {
      if (reuse) keep(path, data);
      setResult({ path, data });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setResult({ path, error: error.message, status: (error as ApiError).status });
    });
    return () => controller.abort();
  }, [path, reuse, attempt]);
  const current = result?.path === path ? result : null;
  const data = (path !== null && reuse && loaded.has(path) ? loaded.get(path) as T : undefined) ?? current?.data;
  const error = data === undefined ? current?.error : undefined;
  return {
    data, error,
    /** The HTTP status of the error (0: the server couldn't be reached). */
    errorStatus: error === undefined ? undefined : current?.status,
    loading: path !== null && data === undefined && !error,
    retry: () => { setResult(null); setAttempt((n) => n + 1); },
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
