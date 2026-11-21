import type { NextConfig } from "next";

// The e2e tests' production build (scripts/run-e2e.mjs --production).
const e2eBuild = process.env.E2E_PRODUCTION === "1" && !!process.env.E2E_RUN_ID;

const nextConfig: NextConfig = {
  experimental: { proxyClientMaxBodySize: "21mb" },
  distDir: e2eBuild ? ".next-e2e-production" : ".next",
  // The tests' build skips the typecheck (half its time): `npm run typecheck`
  // runs beside it in CI (ci.yml's check), and the image's build still checks.
  typescript: { ignoreBuildErrors: e2eBuild },
  // Self-contained server in .next/standalone, used by the Docker image.
  output: "standalone",
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
