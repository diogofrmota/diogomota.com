import { apiRequest } from "@/lib/api-request";

// Changes send a JSON body, an empty one when there is nothing to say: the API takes nothing else.
export function spaceRequest<T>(path = "", method = "GET", body?: object): Promise<T> {
  return apiRequest<T>(`/api/shared/spaces${path}`, {
    method,
    body: method === "GET" ? undefined : (body ?? {}),
    fallback: "Could not reach your space. Try again.",
  });
}
