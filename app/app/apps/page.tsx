import type { Metadata } from "next";
import Link from "next/link";
import { AppList } from "@/components/site/AppList";
import { SitePage } from "@/components/site/SitePage";
import { apps } from "@/lib/apps";
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

export default function AppsPage() {
  return (
    <SitePage>
      <header className={styles.topBar}>
        <Link href="/" className={styles.home}>
          {siteName}
        </Link>
        <nav aria-label="Account" className={styles.account}>
          <Link href="/login">Login</Link>
          <span aria-hidden="true" className={styles.separator}>
            |
          </span>
          <Link href="/signup">Sign Up</Link>
        </nav>
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>apps</h1>
        <AppList apps={apps} />
      </main>
    </SitePage>
  );
}
