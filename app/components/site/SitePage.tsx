import { plexMono } from "@/app/fonts/plex-mono";
import styles from "./site.module.css";

// Frame for the site's own pages (/, the 404 and error pages): black background
// and IBM Plex Mono. The font is applied here rather than in the root layout so
// the apps, and the pages around them, never inherit it.
export function SitePage({
  children,
  centered = false,
}: {
  children: React.ReactNode;
  centered?: boolean;
}) {
  const className = [plexMono.className, styles.page, centered && styles.centered]
    .filter(Boolean)
    .join(" ");
  return <div className={className}>{children}</div>;
}
