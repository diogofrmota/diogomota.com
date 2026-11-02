import type { MetadataRoute } from "next";
import { appsDescription } from "@/lib/apps";
import { siteName } from "@/lib/site";

// The web app manifest (/manifest.webmanifest, linked from every page): added to
// a phone's home screen, the site opens on /apps, without the browser's bars.
// The icons are app/icon.svg's ">_" as PNGs; the maskable one is full bleed, for
// launchers that cut their own shape (the glyph is inside its safe zone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/apps",
    name: siteName,
    short_name: siteName,
    description: appsDescription,
    start_url: "/apps",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
