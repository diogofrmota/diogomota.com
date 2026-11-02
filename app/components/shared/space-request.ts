export async function spaceRequest<T>(path = "", method = "GET", body?: object): Promise<T> {
  const response = await fetch(`/api/shared/spaces${path}`, {
    method, cache: "no-store",
    ...(method !== "GET" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not reach your space. Try again.");
  return result.data;
}
