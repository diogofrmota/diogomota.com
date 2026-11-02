"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import type { AppInfo } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { LoginPrompt } from "./LoginPrompt";
import styles from "./AppList.module.css";

// The app cards on /apps. Logged in, a card goes straight into its app. Logged
// out, it opens the login prompt instead; its href is then the login page, for
// new-tab clicks and clicks that land before hydration. `prompted` is the href
// of an app whose prompt is open from the start.
export function AppList({
  apps,
  loggedIn,
  prompted: initiallyPrompted,
}: {
  apps: readonly AppInfo[];
  loggedIn: boolean;
  prompted?: string;
}) {
  const [prompted, setPrompted] = useState<AppInfo | null>(
    () => apps.find((app) => app.href === initiallyPrompted) ?? null,
  );
  const id = useId();

  return (
    <>
      <ul className={styles.grid}>
        {apps.map((app, i) => (
          <li key={app.href} className={styles.card}>
            <Image src={app.logo} alt="" width={48} height={48} className={styles.logo} />
            <div>
              <h2 className={styles.name}>
                {loggedIn ? (
                  <Link href={app.href} className={styles.link} aria-describedby={`${id}-${i}`}>
                    {app.name}
                  </Link>
                ) : (
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
                )}
              </h2>
              <p id={`${id}-${i}`} className={styles.description}>
                {app.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!loggedIn && <LoginPrompt app={prompted} onClose={() => setPrompted(null)} />}
    </>
  );
}
