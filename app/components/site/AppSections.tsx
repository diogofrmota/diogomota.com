"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CheckIcon } from "@/components/common/icons";
import { apps, appSlug, type AppInfo } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { LoginPrompt } from "./LoginPrompt";
import styles from "./FrontPage.module.css";

/** The front page's groups of apps, by what they're for: each its title, its apps (by href) and a line or so each. */
const groups: { id: string; title: string; apps: AppInfo["href"][]; points: string[] }[] = [
  {
    id: "couples",
    title: "For Couples",
    apps: ["/shared", "/recipes"],
    points: ["One calendar and task list for the two of you.", "Save the recipes you love, and shop from one list."],
  },
  {
    id: "trackers",
    title: "Trackers",
    apps: ["/shows", "/books"],
    points: [
      "Every show, movie and book in one place.",
      "Pick up where you left off, by episode or by page.",
      "See what your friends are watching and reading.",
    ],
  },
  {
    id: "health",
    title: "Health",
    apps: ["/fitness"],
    points: ["Log your workouts, runs and personal records.", "Track water, steps, weight and supplements each day."],
  },
];

const appOf = (href: string) => apps.find((app) => app.href === href)!;

// The apps on the front page (home, logged out), in three groups side by side
// (one over the other on a phone): For Couples, Trackers and Health, each its
// title, its apps' icons (small, each its name under it) and what they do.
// An app's icon opens its login prompt (its href is the login page, for
// new-tab clicks and clicks that land before hydration), and is where its link
// on the site lands (/#shows). `prompted` is the href of an app whose prompt
// is open from the start (`next`, from a protected page).
export function AppSections({ prompted: initiallyPrompted }: { prompted?: string }) {
  const [prompted, setPrompted] = useState<AppInfo | null>(
    () => apps.find((app) => app.href === initiallyPrompted) ?? null,
  );

  return (
    <>
      <div className={styles.groups}>
        {groups.map((group) => (
          <article key={group.id} id={group.id} className={styles.group} aria-labelledby={`${group.id}-title`}>
            <h3 id={`${group.id}-title`} className={styles.groupTitle}>
              {group.title}
            </h3>
            <ul className={styles.groupApps}>
              {group.apps.map(appOf).map((app) => (
                <li key={app.href} id={appSlug(app)} className={styles.groupApp}>
                  <Link
                    href={authHref("/login", app.href)}
                    className={styles.appTile}
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      setPrompted(app);
                    }}
                  >
                    <Image unoptimized src={app.logo} alt="" width={36} height={36} />
                    <span>{app.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <ul className={styles.checks}>
              {group.points.map((point) => (
                <li key={point}>
                  <CheckIcon />
                  {point}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <LoginPrompt app={prompted} onClose={() => setPrompted(null)} />
    </>
  );
}
