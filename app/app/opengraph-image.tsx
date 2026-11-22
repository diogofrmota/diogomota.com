import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { apps } from "@/lib/apps";
import { siteTagline } from "@/lib/site";
import { defaultTheme, themeBackground } from "@/lib/themes";

// Link preview of home and every page without its own (/about has its own),
// rendered once at build time, as the front page's header and headline: the dm
// mark and diogomota, what the site is, and the apps' icons (six, without
// their names, to fit in a row), on the Light theme's gray.
export const alt = `diogomota: ${siteTagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Inline images so the renderer doesn't fetch. Keep file reads scoped for build tracing. */
const inline = async (file: Buffer, svg: boolean) => {
  if (svg) return `data:image/svg+xml;base64,${file.toString("base64")}`;
  // The Open Graph renderer accepts PNG; convert raster app icons before inlining.
  return `data:image/png;base64,${(await sharp(file).png().toBuffer()).toString("base64")}`;
};
const mark = await inline(await readFile(join(process.cwd(), "app", "icon.svg")), true);
const logos = await Promise.all(
  apps.map(async (app) => ({
    name: app.name,
    src: await inline(
      await readFile(join(process.cwd(), "public", "logos", app.logo.slice("/logos/".length))),
      app.logo.endsWith(".svg"),
    ),
  })),
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
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 700 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={56} height={56} alt="" style={{ borderRadius: 12 }} />
        <span>diogomota</span>
      </div>
      <div style={{ marginTop: 36, fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.08 }}>
        {siteTagline}
      </div>
      <div style={{ display: "flex", gap: 28, marginTop: 52 }}>
        {logos.map((logo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={logo.name} src={logo.src} width={104} height={104} alt="" style={{ borderRadius: 24 }} />
        ))}
      </div>
    </div>,
    size,
  );
}
