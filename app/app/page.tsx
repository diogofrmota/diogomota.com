import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSession } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { AppGrid, type GridApp } from "@/components/site/AppGrid";
import { FrontPage } from "@/components/site/FrontPage";
import { SiteFrame } from "@/components/site/SiteFrame";
import { VerifyNote } from "@/components/site/VerifyNote";
import { lastViewCookieName, lastViewHref, recipesViews, sharedViews, showsViews } from "@/lib/app-views";
import { appViewport, apps } from "@/lib/apps";
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

const views: Record<string, readonly string[]> = {
  "/shared": sharedViews,
  "/shows": showsViews,
  "/recipes": recipesViews,
};
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Diogo’s Apps": the first word of the user's name, or their username without one. */
function appsTitle(name: string | null, username: string) {
  const first = name?.trim().split(/\s+/)[0];
  return `${first || username}’s Apps`;
}

// / (docs/decisions/0014, 0016). Logged out, the website's front page
// (FrontPage, in SiteFrame): what the site is, Sign up, a section per app, How
// it works and Questions; `next` is set when the user was sent here from a
// protected page (proxy.ts): Log in and Sign up return there, and for an app
// its prompt opens. Logged in, the apps, in their frame and the user's theme,
// without a tab bar (the icons are the way to everything, Account among
// them): "Diogo’s Apps" over the apps' icons, each with what is waiting in it
// (lib/badges.ts) and going back to the view last used in it
// (lib/app-views.ts). The build's version and Privacy are at the bottom of
// the page, however little is above them.
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
  const [badges, jar] = await Promise.all([homeBadges(user.id), cookies()]);
  const counts: Record<string, [number, string]> = {
    "/shared": [badges.shared, plural(badges.shared, "task due", "tasks due")],
    "/shows": [badges.shows, `${badges.shows} new`],
    "/recipes": [badges.recipes, `${badges.recipes} to buy`],
  };
  const grid: GridApp[] = apps.map((app) => {
    const [badge, badgeLabel] = counts[app.href] ?? [0, ""];
    // Shared without a space has only its welcome: it opens there.
    const remembered = app.href === "/shared" && !badges.inSpace ? undefined : jar.get(lastViewCookieName(app.href));
    return { app, href: lastViewHref(app.href, views[app.href] ?? [], remembered?.value), badge, badgeLabel };
  });
  grid.push({
    app: {
      name: "Account",
      href: "/account",
      description: "Manage your profile and account settings",
      logo: "/logos/account.svg",
    },
    href: "/account",
    badge: 0,
    badgeLabel: "",
  });

  return (
    <AppFrame theme={user.themePreference} username={user.username} name={user.name} avatarUrl={user.avatarUrl} bare>
      <div className={styles.view}>
        {!user.emailVerified && <VerifyNote email={user.email} />}
        <h1 className={`${ui.heading} ${styles.title}`}>{appsTitle(user.name, user.username)}</h1>
        <AppGrid apps={grid} />
        {/* Which build is live (for whoever deploys it, so out of the way), and how the data is kept. */}
        <footer className={styles.footer}>
          Version {version} · <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
    </AppFrame>
  );
}
