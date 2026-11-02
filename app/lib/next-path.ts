// The `next` query parameter: where to send the user after logging in or signing up.

// A same-site path, or null for anything else (absolute URLs, "//host", "/\host"),
// so `next` can never redirect off the site.
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /^\/[/\\]/.test(value)) return null;
  try {
    const base = "http://n.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

// Login or sign-up page that sends the user on to `next` afterwards.
export function authHref(page: "/login" | "/signup", next?: string | null): string {
  return next ? `${page}?${new URLSearchParams({ next })}` : page;
}

// /apps, where a logged-out user can log in and is then sent on to `path`.
export function appsWithNext(path: string): string {
  return `/apps?${new URLSearchParams({ next: path })}`;
}
