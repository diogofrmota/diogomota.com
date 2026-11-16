import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/auth";
import { Avatar } from "@/components/common/Avatar";
import { SiteFrame } from "@/components/site/SiteFrame";
import { apps, appSlug } from "@/lib/apps";
import { aboutDescription, baseOpenGraph, contactEmail, siteName } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "about",
  description: aboutDescription,
  alternates: { canonical: "/about" },
  openGraph: { ...baseOpenGraph, title: siteName, description: aboutDescription, url: "/about" },
};

// Who runs the site, in the website's frame (SiteFrame, docs/decisions/0016),
// in Light, or the user's theme when logged in: Diogo's initials, name and work
// (Richemont opens in a new tab), and where Diogo is based; then what the site
// is, with a link to each app, and where to write to (CONTACT_EMAIL, when set).
export default async function About() {
  const user = await getUser();
  const contact = contactEmail();
  return (
    <SiteFrame theme={user?.themePreference ?? defaultTheme} user={user} current="about">
      <article className={styles.page}>
        <header className={styles.intro}>
          <Avatar username="diogo" name="Diogo Mota" className={styles.avatar} />
          <p className={styles.eyebrow}>About</p>
          <h1>Diogo Mota</h1>
          <p className={styles.lead}>
            DevOps engineer at {/* An aria-label rather than hidden text, so copying the line doesn't pick it up. */}
            <a
              href="https://www.richemont.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Richemont (opens in a new tab)"
            >
              Richemont
            </a>
            , based in Lisbon, Portugal.
          </p>
        </header>

        <section className={styles.card} aria-labelledby="about-site">
          <h2 id="about-site">This site</h2>
          <p>
            diogomota.com is a handful of small apps for the things you share with people:{" "}
            {apps.map((app, i) => (
              <span key={app.href}>
                {i > 0 && (i === apps.length - 1 ? ", and " : ", ")}
                <Link href={user ? app.href : `/#${appSlug(app)}`}>{app.name}</Link>, {app.summary}
              </span>
            ))}
            . More are on the way.
          </p>
          <p>
            Diogo makes them for friends and family, and runs them on a server in Europe. Anyone can sign up; the{" "}
            <Link href="/privacy">Privacy</Link> page says what the site keeps, and why.
          </p>
        </section>

        {contact && (
          <section className={styles.card} aria-labelledby="about-contact">
            <h2 id="about-contact">Get in touch</h2>
            <p>
              Questions, ideas or something that doesn&rsquo;t work? Write to{" "}
              <a href={`mailto:${contact}`}>{contact}</a>.
            </p>
          </section>
        )}
      </article>
    </SiteFrame>
  );
}
