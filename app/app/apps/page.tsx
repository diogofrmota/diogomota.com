import type { Metadata } from "next";
import { auth } from "@/auth";
import { AppList } from "@/components/site/AppList";
import { SitePage } from "@/components/site/SitePage";
import { TopBar } from "@/components/site/TopBar";
import { apps } from "@/lib/apps";
import { safeNextPath } from "@/lib/next-path";
import { baseOpenGraph, siteName, siteViewport } from "@/lib/site";
import styles from "./page.module.css";

const names = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));
const description = `Small apps for friends: ${names}.`;

export const metadata: Metadata = {
  title: "apps",
  description,
  alternates: { canonical: "/apps" },
  openGraph: { ...baseOpenGraph, title: `apps · ${siteName}`, description, url: "/apps" },
};

export const viewport = siteViewport;

// `next` is set when a logged-out user was sent here from a protected page
// (proxy.ts): Login and Sign Up return there, and for an app its login prompt opens.
export default async function AppsPage({ searchParams }: PageProps<"/apps">) {
  const session = await auth();
  const username = session?.user.username ?? null;
  const next = username ? null : safeNextPath((await searchParams).next);
  const prompted = apps.find((app) => next === app.href || next?.startsWith(`${app.href}/`));

  return (
    <SitePage>
      <TopBar username={username} next={next} />
      <main className={styles.main}>
        <h1 className={styles.title}>apps</h1>
        <AppList apps={apps} loggedIn={username !== null} prompted={prompted?.href} />
      </main>
    </SitePage>
  );
}
