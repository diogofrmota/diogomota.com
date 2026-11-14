import type { MetadataRoute } from "next";
import { appsDescription } from "@/lib/apps";
import { siteName } from "@/lib/site";
import { defaultTheme, themeBackground } from "@/lib/themes";

// The web app manifest (/manifest.webmanifest, linked from every page): added to
// a phone's home screen, the site opens on home (the apps), without the
// browser's bars. Its id is still /apps, where it opened until home became the
// apps (docs/decisions/0014): phones that added it then keep one app, not two.
// The icons are app/icon.svg's ">_" as PNGs; the maskable one is full bleed, for
// launchers that cut their own shape (the glyph is inside its safe zone). The
// splash screen and the bar around it take the color of home as it opens, in
// the default theme (Light), so starting the app doesn't flash black.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/apps",
    name: siteName,
    short_name: siteName,
    description: appsDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: themeBackground(defaultTheme),
    theme_color: themeBackground(defaultTheme),
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
