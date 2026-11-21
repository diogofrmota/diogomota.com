import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import type { GridApp } from "@/components/site/AppGrid";
import { AppFolders, type HomeFolder } from "@/components/site/AppFolders";
import { FrontPage } from "@/components/site/FrontPage";
import { ProfileHeader } from "@/components/site/ProfileHeader";
import { SiteFrame } from "@/components/site/SiteFrame";
import { VerifyNote } from "@/components/site/VerifyNote";
import { homeViews, viewFromParams } from "@/lib/app-views";
import { appViewport, appsOf, folders } from "@/lib/apps";
import { homeBadges } from "@/lib/badges";
import { safeNextPath } from "@/lib/next-path";
import { baseOpenGraph, siteDescription as description, siteName } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";
import { findUserById } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = {
  description,
  alternates: { canonical: "/" },
  openGraph: { ...baseOpenGraph, title: siteName, description, url: "/" },
};

export const viewport = appViewport;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// / (docs/decisions/0014, 0016, 0023). Logged out, the website's front page
// (FrontPage, in SiteFrame): what the site is, Sign up, the apps in three
// groups, How it works and How to add to Home Screen; `next` is set when the user was sent here from a
// protected page (proxy.ts): Log in and Sign up return there, and for an app
// its prompt opens. Logged in, in the user's theme, without a tab bar: who is
// here at the top (ProfileHeader: the picture, the name, the username and
// Account settings), then the apps in three folders, For Couples, Trackers and
// Health (AppFolders), each with what is waiting in its apps (lib/badges.ts),
// opening in a popup (?p=folder:couples) with its apps. The build's version,
// Privacy and Report a bug are at the bottom of the page, however little is above them.
export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getSession();
  const user = session ? await findUserById(session.user.id) : null;
  const query = await searchParams;

  if (!user) {
    const next = safeNextPath(query.next);
    return (
      <SiteFrame theme={defaultTheme} user={null} next={next} current="home">
        <FrontPage next={next} deleted={query.account === "deleted"} />
      </SiteFrame>
    );
  }

  // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
  const version = process.env.APP_VERSION ?? "dev";
  const badges = await homeBadges(user.id);
  const counts: Record<string, [number, string]> = {
    "/tasks": [badges.tasks, plural(badges.tasks, "task due", "tasks due")],
    "/shows": [badges.shows + badges.social, `${badges.shows + badges.social} new`],
    "/recipes": [badges.recipes, `${badges.recipes} to buy`],
    "/fitness": [badges.fitness, plural(badges.fitness, "supplement to take", "supplements to take")],
  };
  const homeFolders: HomeFolder[] = folders.map((folder) => {
    const apps: GridApp[] = appsOf(folder).map((app) => {
      const [badge, badgeLabel] = counts[app.href] ?? [0, ""];
      return { app, href: app.href, badge, badgeLabel };
    });
    return {
      id: folder.id,
      title: folder.title,
      private: folder.private,
      apps,
      badge: apps.reduce((sum, app) => sum + app.badge, 0),
    };
  });
  // Only home's one view: what isn't a folder in ?p= is left closed.
  const initial = viewFromParams(homeViews, undefined, query.p)!;

  return (
    <AppFrame theme={user.themePreference} username={user.username} name={user.name} avatarUrl={user.avatarUrl} bare>
      <div className={styles.view}>
        {!user.emailVerified && <VerifyNote email={user.email} />}
        <div className={styles.launcher}>
          <ProfileHeader username={user.username} name={user.name} avatarUrl={user.avatarUrl} />
          <AppFolders folders={homeFolders} inGroup={badges.inSpace} initial={initial} />
        </div>
        {/* Which build is live (for whoever deploys it, so out of the way), how the data is kept, and where to say what's broken. */}
        <footer className={styles.footer}>
          Version {version} · <Link href="/privacy">Privacy</Link> · <Link href="/report-bug">Report a bug</Link>
        </footer>
      </div>
    </AppFrame>
  );
}
