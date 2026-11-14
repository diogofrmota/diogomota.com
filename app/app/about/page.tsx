import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/SitePage";
import site from "@/components/site/site.module.css";
import { aboutDescription, baseOpenGraph, siteName, siteViewport } from "@/lib/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "about",
  description: aboutDescription,
  alternates: { canonical: "/about" },
  openGraph: { ...baseOpenGraph, title: siteName, description: aboutDescription, url: "/about" },
};

export const viewport = siteViewport;

// Who runs the site: what was its front page until home became the apps
// (docs/decisions/0014), as it was. Black, IBM Plex Mono (SitePage), four lines
// and See the apps, which goes home.
export default function About() {
  return (
    <SitePage centered>
      <main className={styles.main}>
        <h1>diogo mota</h1>
        <p>
          devops engineer @ {/* An aria-label rather than hidden text, so copying the line doesn't pick it up. */}
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
          <Link href="/" className={site.button}>
            See the apps
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
