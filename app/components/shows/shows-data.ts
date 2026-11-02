"use client";
import { useEffect, useState } from "react";
import { useAppView } from "@/hooks/useAppView";
import { titleKey, type TitleSummary } from "@/lib/show-types";

export class ShowsRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Calls /api/shows{path} and returns its data, or throws its error message. */
export async function showsRequest<T>(path: string, { method = "GET", body, signal }: { method?: string; body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`/api/shows${path}`, { method, signal, cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch((error) => {
    if (signal?.aborted) throw error;
    throw new ShowsRequestError("Could not reach the server. Check your connection.", 0);
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ShowsRequestError(result.error ?? "Something went wrong. Try again.", response.status);
  return result.data;
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
      if (!controller.signal.aborted) setResult({ path, error: error.message, status: (error as ShowsRequestError).status });
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
