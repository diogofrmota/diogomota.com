import type { NextConfig } from "next";

// The e2e tests' production build (scripts/run-e2e.mjs --production).
const e2eBuild = process.env.E2E_PRODUCTION === "1" && !!process.env.E2E_RUN_ID;

// What a page may load (nginx sends the other security headers). Without
// nonces (those would make every page dynamic, and the service worker keeps
// pages for offline), so inline scripts stay allowed: Next.js writes its own.
// What it stops is scripts, styles and requests from anywhere else, which is
// where injected content would send what it read. Images: TMDB's posters, and
// Open Library's covers, which redirect to archive.org and its servers. Only in
// production builds (next dev evaluates code), which the e2e tests run under,
// failing on any violation (e2e/fixtures.ts).
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://image.tmdb.org https://covers.openlibrary.org https://archive.org https://*.archive.org",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "21mb",
    // Turbopack's default merges every app's CSS into the chunks that hold the
    // shared ui.module.css, so /login, the front page and the 404 loaded the
    // styles of all the apps (~190 KB). The graph splits them by route instead.
    cssChunking: "graph",
  },
  distDir: e2eBuild ? ".next-e2e-production" : ".next",
  // The tests' build skips the typecheck (half its time): `npm run typecheck`
  // runs beside it in CI (ci.yml's check), and the image's build still checks.
  typescript: { ignoreBuildErrors: e2eBuild },
  // Self-contained server in .next/standalone, used by the Docker image.
  output: "standalone",
  headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] }];
  },
  // The apps were at /apps until home became them (docs/decisions/0014): old
  // links, bookmarks and emails land on home, with their query (?next=,
  // ?account=deleted) kept.
  // Social's pages moved into Shows' (and Books') Profile tab: a friend's
  // profile to their Shows profile, the rest to your own.
  // Benfica is no longer an app: its games are imported into the calendar from
  // the group's settings, where its old links land.
  // For Couples' apps (docs/decisions/0023): Calendar was /shared, with Tasks
  // and Settings as its tabs; now /calendar, /tasks and the group's settings at
  // /couples. Their open panels (?p=) come along with the query.
  redirects() {
    return [
      { source: "/apps", destination: "/", permanent: true },
      { source: "/social/profile/:id", destination: "/shows/profile/:id", permanent: true },
      { source: "/social/:path*", destination: "/shows/profile", permanent: true },
      { source: "/benfica/:path*", destination: "/couples", permanent: true },
      { source: "/shared", destination: "/calendar", permanent: true },
      { source: "/shared/tasks", destination: "/tasks", permanent: true },
      { source: "/shared/settings", destination: "/couples", permanent: true },
      { source: "/shared/:path*", destination: "/calendar", permanent: true },
    ];
  },
};

export default nextConfig;
