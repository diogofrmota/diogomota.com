"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import type { AppInfo } from "@/lib/apps";
import { authHref, LoginPrompt } from "./LoginPrompt";
import styles from "./AppList.module.css";

// The app cards on /apps. Logged out, a card opens the login prompt instead of
// the app. Its href is the login page, for new-tab clicks and clicks that land
// before hydration.
export function AppList({ apps }: { apps: readonly AppInfo[] }) {
  const [prompted, setPrompted] = useState<AppInfo | null>(null);
  const id = useId();

  return (
    <>
      <ul className={styles.grid}>
        {apps.map((app, i) => (
          <li key={app.href} className={styles.card}>
            <Image src={app.logo} alt="" width={48} height={48} className={styles.logo} />
            <div>
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
              <p id={`${id}-${i}`} className={styles.description}>
                {app.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <LoginPrompt app={prompted} onClose={() => setPrompted(null)} />
    </>
  );
}
