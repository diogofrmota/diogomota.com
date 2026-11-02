import type { Metadata } from "next";
import Link from "next/link";
import { Brackets, SitePage } from "@/components/site/SitePage";
import site from "@/components/site/site.module.css";
import { baseOpenGraph, siteDescription, siteName, siteViewport } from "@/lib/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...baseOpenGraph, title: siteName, description: siteDescription, url: "/" },
};

export const viewport = siteViewport;

export default function Home() {
  return (
    <SitePage centered>
      <main className={styles.main}>
        <h1 className={styles.name}>diogo mota</h1>
        <p className={site.muted}>
          devops engineer @{" "}
          <a href="https://www.richemont.com/" className={styles.employer}>
            Richemont
          </a>
        </p>
        <p className={site.muted}>currently based in Lisbon, PT</p>
        <p className={styles.action}>
          <Link href="/apps" className={site.bracket}>
            <Brackets>Check Apps</Brackets>
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
