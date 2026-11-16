import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { defaultTheme, themeBackground } from "@/lib/themes";

// Link preview of /about, rendered once at build time, as the page: the >_
// mark and diogomota, then the name, the work and the city, on the Light
// theme's gray.
export const alt = "Diogo Mota, DevOps engineer at Richemont, based in Lisbon, Portugal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The site's icon, inlined: the renderer doesn't fetch.
const mark = `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), "app/icon.svg"))).toString("base64")}`;

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
      <div style={{ marginTop: 40, fontSize: 92, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
        Diogo Mota
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 24, fontSize: 44, color: "#4e4e58" }}>
        <span>DevOps engineer at Richemont</span>
        <span>Based in Lisbon, Portugal</span>
      </div>
    </div>,
    size,
  );
}
