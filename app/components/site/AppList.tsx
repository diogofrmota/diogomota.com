"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import type { AppInfo } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { AppPreview } from "./AppPreview";
import { LoginPrompt } from "./LoginPrompt";
import styles from "./AppList.module.css";

// The app cards of the front page (home, logged out): a picture of the app
// (AppPreview), then its icon and name, and what it does, a short line each.
// A card opens the login prompt for its app; its href is the login page, for
// new-tab clicks and clicks that land before hydration. `prompted` is the href
// of an app whose prompt is open from the start (`next`, from a protected page).
export function AppList({ apps, prompted: initiallyPrompted }: { apps: readonly AppInfo[]; prompted?: string }) {
  const [prompted, setPrompted] = useState<AppInfo | null>(
    () => apps.find((app) => app.href === initiallyPrompted) ?? null,
  );
  const id = useId();

  return (
    <>
      <ul className={styles.grid}>
        {apps.map((app, i) => (
          <li key={app.href} className={styles.card} style={{ "--i": i } as React.CSSProperties}>
            <AppPreview href={app.href} />
            <div className={styles.info}>
              <Image src={app.logo} alt="" width={56} height={56} className={styles.logo} />
              <h2 className={styles.name}>
                <Link
                  href={authHref("/login", app.href)}
                  className={styles.link}
                  aria-haspopup="dialog"
                  aria-describedby={`${id}-${i}`}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    setPrompted(app);
                  }}
                >
                  {app.name}
                </Link>
              </h2>
            </div>
            <ul id={`${id}-${i}`} className={styles.features}>
              {app.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <LoginPrompt app={prompted} onClose={() => setPrompted(null)} />
    </>
  );
}
