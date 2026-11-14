import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { apps } from "@/lib/apps";
import { defaultTheme, themeBackground } from "@/lib/themes";

// Link preview of home and every page without its own (/about has the intro),
// rendered once at build time: the >_ mark and the site's name, what it is,
// and the apps' icons, on the Light theme's gray, as home opens logged out.
export const alt = "diogomota.com: small apps for friends, Shared and Shows";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image renderer can't read woff2, so this uses the .woff of the same font.
const plexMono = await readFile(join(process.cwd(), "app/fonts/IBMPlexMono-Regular.woff"));
// The icons as they are in public/logos, inlined: the renderer doesn't fetch.
const logos = await Promise.all(
  apps.map(async (app) => {
    const svg = await readFile(join(process.cwd(), "public", app.logo));
    return { name: app.name, src: `data:image/svg+xml;base64,${svg.toString("base64")}` };
  }),
);

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: themeBackground(defaultTheme),
        color: "#101014",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: "IBM Plex Mono", fontSize: 40 }}>
        <span style={{ color: "#30507a" }}>&gt;_</span>
        <span>diogomota.com</span>
      </div>
      <div style={{ marginTop: 28, fontSize: 84, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
        Small apps for friends
      </div>
      <div style={{ display: "flex", gap: 36, marginTop: 56 }}>
        {logos.map((logo) => (
          <div key={logo.name} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} width={96} height={96} alt="" style={{ borderRadius: 22 }} />
            <span style={{ fontSize: 40, color: "#4e4e58" }}>{logo.name}</span>
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts: [{ name: "IBM Plex Mono", data: plexMono, weight: 400, style: "normal" }] },
  );
}
