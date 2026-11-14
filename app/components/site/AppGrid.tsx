"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { useId } from "react";
import type { AppInfo } from "@/lib/apps";
import styles from "./AppGrid.module.css";

/** An app on home, logged in: where its icon goes, and what is waiting in it. */
export type GridApp = {
  app: AppInfo;
  /** The app's own path, or the view last used in it on this device (lib/app-views.ts, lastViewHref). */
  href: string;
  /** How many things are waiting (lib/badges.ts); none shows no badge. */
  badge: number;
  /** What the badge counts, for screen readers: "2 tasks due". */
  badgeLabel: string;
};

/** "9+" past nine, as a phone's badges do: the count is a nudge, not a total. */
export const badgeText = (count: number) => (count > 9 ? "9+" : String(count));

// A ring over the icon from the tap until the app has loaded (the apps have no
// loading screen: their theme is only known once the server has rendered them).
function PendingRing() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`${styles.pending} ${pending ? styles.active : ""}`} />;
}

/**
 * Home's apps, logged in: a grid of their icons, like a phone's home screen,
 * each with its name under it and a count of what is waiting in it on its
 * corner. Each goes straight into its app, on the view last used there.
 */
export function AppGrid({ apps }: { apps: readonly GridApp[] }) {
  const id = useId();
  return (
    <ul className={styles.grid}>
      {apps.map(({ app, href, badge, badgeLabel }, i) => (
        <li key={app.href} style={{ "--i": i } as React.CSSProperties}>
          <Link
            href={href}
            className={styles.app}
            // With a badge, the count is read out with the name: "Shared, 2 tasks due".
            aria-label={badge > 0 ? `${app.name}, ${badgeLabel}` : undefined}
            aria-describedby={`${id}-${i}`}
          >
            <span className={styles.icon}>
              <Image src={app.logo} alt="" width={72} height={72} className={styles.logo} />
              {badge > 0 && (
                <span className={styles.badge} aria-hidden="true">
                  {badgeText(badge)}
                </span>
              )}
              <PendingRing />
            </span>
            <span className={styles.name}>{app.name}</span>
          </Link>
          <span id={`${id}-${i}`} hidden>
            {app.description}
          </span>
        </li>
      ))}
    </ul>
  );
}
