import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { AppList } from "@/components/site/AppList";
import { LoginCallout } from "@/components/site/LoginCallout";
import { appAt, appViewport, apps, appsDescription as description } from "@/lib/apps";
import { safeNextPath } from "@/lib/next-path";
import { baseOpenGraph, siteName } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";
import { findUserById } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "apps",
  description,
  alternates: { canonical: "/apps" },
  openGraph: { ...baseOpenGraph, title: `apps · ${siteName}`, description, url: "/apps" },
};

export const viewport = appViewport;

// The way into the apps, and between them (Apps in each app's tab bar).
// In the apps' frame and the user's theme (Light mode when logged out); its tab
// bar has Account and Apps (this page), or Log in, Sign up and Apps. Logged out, a
// call to action over the cards has them too (LoginCallout). Each card shows
// what its app looks like (AppPreview); the build's version is at the bottom.
//
// `next` is set when a logged-out user was sent here from a protected page
// (proxy.ts): Login and Sign Up return there, and for an app its login prompt opens.
export default async function AppsPage({ searchParams }: PageProps<"/apps">) {
  const session = await getSession();
  const user = session ? await findUserById(session.user.id) : null;
  const username = session?.user.username ?? null;
  const query = await searchParams;
  const next = username ? null : safeNextPath(query.next);
  // Just deleted (app/account/actions.ts, deleteAccount): logged out, and told so.
  const deleted = !username && query.account === "deleted";
  const prompted = appAt(next);
  // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
  const version = process.env.APP_VERSION ?? "dev";

  return (
    <AppFrame
      theme={user?.themePreference ?? defaultTheme}
      username={username}
      avatarUrl={user?.avatarUrl}
      next={next}
      launcher="apps"
    >
      <div className={styles.view}>
        {deleted && (
          <p role="status" className={ui.success}>
            Your account and everything it had here were deleted.
          </p>
        )}
        {user && !user.emailVerified && (
          <p className={styles.verify}>
            Confirm your email ({user.email}) with the link we sent, so you can reset your password if you forget it.{" "}
            <Link href="/account">Send it again</Link>
          </p>
        )}
        {!username && <LoginCallout next={next} />}
        <h1 className={ui.heading}>Apps</h1>
        <AppList apps={apps} loggedIn={username !== null} prompted={prompted?.href} />
        {/* Which build is live: for whoever deploys it, so out of the way. */}
        <p className={styles.version}>
          Version {version} · <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </AppFrame>
  );
}
