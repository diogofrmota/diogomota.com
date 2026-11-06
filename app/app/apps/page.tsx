import type { Metadata } from "next";
import { auth } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { AppList } from "@/components/site/AppList";
import { LoginCallout } from "@/components/site/LoginCallout";
import { appViewport, apps, appsDescription as description } from "@/lib/apps";
import { safeNextPath } from "@/lib/next-path";
import { baseOpenGraph, siteName } from "@/lib/site";
import { themeOf } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "apps",
  description,
  alternates: { canonical: "/apps" },
  openGraph: { ...baseOpenGraph, title: `apps · ${siteName}`, description, url: "/apps" },
};

export const viewport = appViewport;

// The way into the apps, and between them (Switch app in the apps' account menu).
// In the apps' frame and the user's theme (dark when logged out); the top bar
// has diogomota.com and the account menu, or Login and Sign Up. Logged out, a
// call to action over the cards has them too (LoginCallout).
//
// `next` is set when a logged-out user was sent here from a protected page
// (proxy.ts): Login and Sign Up return there, and for an app its login prompt opens.
export default async function AppsPage({ searchParams }: PageProps<"/apps">) {
  const session = await auth();
  const username = session?.user.username ?? null;
  const next = username ? null : safeNextPath((await searchParams).next);
  const prompted = apps.find((app) => next === app.href || next?.startsWith(`${app.href}/`));
  // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
  const version = process.env.APP_VERSION ?? "dev";

  return (
    <AppFrame theme={await themeOf(session?.user.id)} username={username} next={next}>
      <div className={ui.view}>
        {!username && <LoginCallout apps={apps} next={next} />}
        <h1 className={ui.heading}>
          Apps <span className={styles.version}>({version})</span>
        </h1>
        <AppList apps={apps} loggedIn={username !== null} prompted={prompted?.href} />
      </div>
    </AppFrame>
  );
}
