// In-memory, fixed-window rate limits. One app process serves the whole site, so
// this is enough at its scale (~10 users); the counters reset when the app restarts.

type Window = { count: number; resetAt: number };

// One store across dev hot reloads, like the pg pool in db.ts.
const globalForLimits = globalThis as typeof globalThis & { rateLimitWindows?: Map<string, Window> };
const windows = (globalForLimits.rateLimitWindows ??= new Map());

const MINUTE = 60_000;

// Returns a function that records one attempt for `key` and says whether it is
// within `limit` attempts per `windowMs`.
function rateLimit(name: string, limit: number, windowMs: number) {
  return (key: string): boolean => {
    const now = Date.now();
    if (windows.size > 10_000) {
      for (const [k, window] of windows) if (window.resetAt <= now) windows.delete(k);
    }

    const id = `${name}:${key}`;
    const window = windows.get(id);
    if (!window || window.resetAt <= now) {
      windows.set(id, { count: 1, resetAt: now + windowMs });
      return true;
    }
    window.count += 1;
    return window.count <= limit;
  };
}

/** Login attempts per client IP. */
export const loginLimit = rateLimit("login", 10, 15 * MINUTE);
/** Sign-up attempts (that pass validation) per client IP. */
export const signUpLimit = rateLimit("signup", 5, 60 * MINUTE);
/** Current-password checks in account settings, per user. */
export const passwordCheckLimit = rateLimit("password", 10, 15 * MINUTE);
/** Live username availability checks, per authenticated user. */
export const usernameCheckLimit = rateLimit("username-check", 60, MINUTE);
/** Password reset requests (that pass validation) per client IP. */
export const resetRequestLimit = rateLimit("reset", 5, 60 * MINUTE);
/** Password reset emails per address (lowercase), whether or not an account has it. */
export const resetEmailLimit = rateLimit("reset-email", 3, 60 * MINUTE);
/** Short invite code guesses, per authenticated user. */
export const spaceJoinLimit = rateLimit("space-join", 20, 15 * MINUTE);
/** Friend requests (that pass validation), per authenticated user: each one says whether a username exists. */
export const friendRequestLimit = rateLimit("friend-request", 20, 15 * MINUTE);
/** Username suggestions in Shows' Add a friend (one per pause in typing), per authenticated user. */
export const userSearchLimit = rateLimit("user-search", 60, MINUTE);
/**
 * Shows API requests (each may call TMDB with the site's token), per authenticated
 * user. Discover alone loads up to seven sections per type; TMDB's lists are
 * cached (lib/tmdb.ts), so most of these don't reach it.
 */
export const showsRequestLimit = rateLimit("shows", 240, MINUTE);

// nginx sets X-Forwarded-For to exactly the client address (nginx/nginx.conf), so
// in production its first entry can be trusted. In development it is whatever the
// client sent, or the socket address that Next.js fills in when it's missing.
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
