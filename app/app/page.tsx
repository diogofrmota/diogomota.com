import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/SitePage";
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
        <h1>diogo mota</h1>
        <p>
          devops engineer @{" "}
          {/* An aria-label rather than hidden text, so copying the line doesn't pick it up. */}
          <a
            href="https://www.richemont.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Richemont (opens in a new tab)"
          >
            Richemont
          </a>
        </p>
        <p>currently based in Lisbon, PT</p>
        <p className={styles.checkApps}>
          <Link href="/apps" className={site.button}>
            Check Apps
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
