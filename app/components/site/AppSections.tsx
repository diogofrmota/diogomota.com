"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon, CheckIcon } from "@/components/common/icons";
import ui from "@/components/common/ui.module.css";
import { apps, appSlug, type AppInfo } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { AppWindow } from "./AppWindow";
import { LoginPrompt } from "./LoginPrompt";
import styles from "./FrontPage.module.css";

// The apps on the front page (home, logged out), a section each, by turns
// picture then words and words then picture: the app in a window (AppWindow,
// on a wider screen only: a phone has just the words), then its name and icon, its headline, what it does, and Open, which opens
// its login prompt (its href is the login page, for new-tab clicks and clicks
// that land before hydration). `prompted` is the href of an app whose prompt
// is open from the start (`next`, from a protected page).
export function AppSections({ prompted: initiallyPrompted }: { prompted?: string }) {
  const [prompted, setPrompted] = useState<AppInfo | null>(
    () => apps.find((app) => app.href === initiallyPrompted) ?? null,
  );

  return (
    <>
      {apps.map((app, i) => {
        const slug = appSlug(app);
        return (
          <article
            key={app.href}
            id={slug}
            className={`${styles.app} ${i % 2 ? styles.reverse : ""}`}
            aria-labelledby={`${slug}-name`}
          >
            <AppWindow href={app.href} className={styles.appWindow} />
            <div className={styles.appCopy}>
              <h3 id={`${slug}-name`} className={styles.appName}>
                <Image src={app.logo} alt="" width={36} height={36} />
                {app.name}
              </h3>
              <p className={styles.tagline}>{app.tagline}</p>
              <ul className={styles.checks}>
                {app.features.map((feature) => (
                  <li key={feature}>
                    <CheckIcon />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={authHref("/login", app.href)}
                className={ui.button}
                aria-haspopup="dialog"
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  setPrompted(app);
                }}
              >
                Open {app.name}
                <ArrowRightIcon />
              </Link>
            </div>
          </article>
        );
      })}
      <LoginPrompt app={prompted} onClose={() => setPrompted(null)} />
    </>
  );
}
