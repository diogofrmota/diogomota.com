import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, used by the Docker image.
  output: "standalone",
  // The apps were at /apps until home became them (docs/decisions/0014): old
  // links, bookmarks and emails land on home, with their query (?next=,
  // ?account=deleted) kept.
  // Social's pages moved into Shows' (and Books') Profile tab: a friend's
  // profile to their Shows profile, the rest to your own.
  redirects() {
    return [
      { source: "/apps", destination: "/", permanent: true },
      { source: "/social/profile/:id", destination: "/shows/profile/:id", permanent: true },
      { source: "/social/:path*", destination: "/shows/profile", permanent: true },
    ];
  },
};

export default nextConfig;
