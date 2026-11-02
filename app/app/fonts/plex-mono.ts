import localFont from "next/font/local";

// IBM Plex Mono Regular from @ibm/plex-mono 1.1.0 (SIL OFL 1.1, see OFL.txt),
// served from this site, never from Google. The woff2 is IBM's Latin-1 subset;
// the full .woff next to it is only read at build time by opengraph-image.tsx.
// Only the site's own pages (/, /apps, account, login and the like, 404) use this font.
export const plexMono = localFont({
  src: "./IBMPlexMono-Regular-Latin1.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
  // The automatic fallback is metric-matched to Arial, which suits sans fonts, not a monospace one.
  adjustFontFallback: false,
});
