import Link from "next/link";
import type { Theme } from "@/lib/users";
import styles from "./AppPlaceholder.module.css";

// Stand-in for an app until it is built: who is signed in, in the user's theme
// and the apps' font (the system stack, not IBM Plex Mono).
export function AppPlaceholder({
  name,
  username,
  theme,
}: {
  name: string;
  username: string;
  theme: Theme;
}) {
  return (
    <div className={styles.page} data-theme={theme}>
      <main className={styles.main}>
        <h1 className={styles.title}>{name}</h1>
        <p>
          signed in as <strong>{username}</strong>
        </p>
        <p className={styles.muted}>This app is coming soon.</p>
        <p>
          <Link href="/apps">
            <span aria-hidden="true">←</span>Back to Apps
          </Link>
        </p>
      </main>
    </div>
  );
}
