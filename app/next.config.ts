import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, used by the Docker image.
  output: "standalone",
  // The apps were at /apps until home became them (docs/decisions/0014): old
  // links, bookmarks and emails land on home, with their query (?next=,
  // ?account=deleted) kept.
  redirects() {
    return [{ source: "/apps", destination: "/", permanent: true }];
  },
};

export default nextConfig;
