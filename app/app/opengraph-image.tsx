import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Link preview for every page, rendered once at build time.
export const alt = "diogo mota, devops engineer @ Richemont, currently based in Lisbon, PT";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image renderer can't read woff2, so this uses the .woff of the same font.
const plexMono = await readFile(join(process.cwd(), "app/fonts/IBMPlexMono-Regular.woff"));

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#a3a3a3",
          fontFamily: "IBM Plex Mono",
          fontSize: 36,
          lineHeight: 1.6,
        }}
      >
        <div style={{ color: "#fff", fontSize: 72, marginBottom: 24 }}>diogo mota</div>
        <div>devops engineer @ Richemont</div>
        <div>currently based in Lisbon, PT</div>
      </div>
    ),
    { ...size, fonts: [{ name: "IBM Plex Mono", data: plexMono, weight: 400, style: "normal" }] },
  );
}
