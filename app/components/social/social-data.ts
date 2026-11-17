"use client";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-request";

export function socialRequest<T>(path: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}) {
  return apiRequest<T>(`/api/social${path}`, { ...options, fallback: "Could not load Social. Try again." });
}

// No offline persistence or stale profile fallback: an authorization failure hides previous data.
export function useSocialData<T>(path: string) {
  const result = useQuery({
    queryKey: ["social", path],
    queryFn: ({ signal }) => socialRequest<T>(path, { signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return {
    data: result.error ? undefined : result.data,
    error: result.error,
    loading: result.isPending,
    retry: () => void result.refetch(),
  };
}
