import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSession } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { AppGrid, type GridApp } from "@/components/site/AppGrid";
import { AppList } from "@/components/site/AppList";
import { Hero } from "@/components/site/Hero";
import { VerifyNote } from "@/components/site/VerifyNote";
import { lastViewCookieName, lastViewHref, sharedViews, showsViews } from "@/lib/app-views";
import { appAt, appViewport, apps, appsDescription as description } from "@/lib/apps";
import { homeBadges } from "@/lib/badges";
import { safeNextPath } from "@/lib/next-path";
import { baseOpenGraph, siteName } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";
import { findUserById } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = {
  description,
  alternates: { canonical: "/" },
  openGraph: { ...baseOpenGraph, title: siteName, description, url: "/" },
};

export const viewport = appViewport;

const views: Record<string, readonly string[]> = { "/shared": sharedViews, "/shows": showsViews };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Home: the apps (docs/decisions/0014), in their frame and the user's theme
// (Light logged out), with the tab bar of the pages around them: Account and
// Home, or Log in, Sign up and Home. Logged in, the apps' icons, each with what
// is waiting in it (lib/badges.ts) and going back to the view last used in it
// (lib/app-views.ts). Logged out, the front page: what the site is, Log in and
// Sign up, and a card for each app, which opens its login prompt. The build's
// version, Privacy and About are at the bottom.
//
// `next` is set when a logged-out user was sent here from a protected page
// (proxy.ts): Log in and Sign up return there, and for an app its prompt opens.
export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getSession();
  const user = session ? await findUserById(session.user.id) : null;
  const query = await searchParams;
  const next = user ? null : safeNextPath(query.next);
  // Just deleted (app/account/actions.ts, deleteAccount): logged out, and told so.
  const deleted = !user && query.account === "deleted";
  // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
  const version = process.env.APP_VERSION ?? "dev";

  let grid: GridApp[] = [];
  if (user) {
    const [badges, jar] = await Promise.all([homeBadges(user.id), cookies()]);
    const counts: Record<string, [number, string]> = {
      "/shared": [badges.shared, plural(badges.shared, "task due", "tasks due")],
      "/shows": [badges.shows, `${badges.shows} new`],
    };
    grid = apps.map((app) => {
      const [badge, badgeLabel] = counts[app.href] ?? [0, ""];
      // Shared without a space has only its welcome: it opens there.
      const remembered = app.href === "/shared" && !badges.inSpace ? undefined : jar.get(lastViewCookieName(app.href));
      return { app, href: lastViewHref(app.href, views[app.href] ?? [], remembered?.value), badge, badgeLabel };
    });
  }

  return (
    <AppFrame
      theme={user?.themePreference ?? defaultTheme}
      username={user?.username ?? null}
      name={user?.name}
      avatarUrl={user?.avatarUrl}
      next={next}
      current="home"
    >
      <div className={styles.view}>
        {deleted && (
          <p role="status" className={ui.success}>
            Your account and everything it had here were deleted.
          </p>
        )}
        {user ? (
          <>
            {!user.emailVerified && <VerifyNote email={user.email} />}
            <h1 className={ui.heading}>Apps</h1>
            <AppGrid apps={grid} />
          </>
        ) : (
          <>
            <Hero next={next} />
            <h2 className={styles.appsHeading}>The apps</h2>
            <AppList apps={apps} prompted={appAt(next)?.href} />
          </>
        )}
        {/* Which build is live (for whoever deploys it, so out of the way), and the pages about the site. */}
        <p className={styles.footer}>
          Version {version} · <Link href="/privacy">Privacy</Link> · <Link href="/about">About</Link>
        </p>
      </div>
    </AppFrame>
  );
}
