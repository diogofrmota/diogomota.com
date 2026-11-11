/** A refused API call: the message to show, and the HTTP status (0: the server couldn't be reached). */
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/**
 * Calls one of the apps' JSON APIs from the browser and returns the `data` of
 * its answer, or throws an ApiError with the `error` it gave, or `fallback` when
 * the answer has none (a proxy's error page, say). Not reaching the server gets
 * a message of its own; an aborted request rejects as aborted.
 */
export async function apiRequest<T>(url: string, { method = "GET", body, signal, keepalive, fallback }: {
  /** Sent as JSON; FormData (a file upload) as it is, multipart. */
  method?: string; body?: object | FormData; signal?: AbortSignal; keepalive?: boolean; fallback: string;
}): Promise<T> {
  const response = await fetch(url, { method, signal, keepalive, cache: "no-store",
    ...(body instanceof FormData ? { body }
      : body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch((error) => {
    if (signal?.aborted) throw error;
    throw new ApiError("Could not reach the server. Check your connection.", 0);
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.error ?? fallback, response.status);
  return result.data;
}
