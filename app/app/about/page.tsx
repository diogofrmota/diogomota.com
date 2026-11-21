import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/auth";
import { Avatar } from "@/components/common/Avatar";
import { ContactForm } from "@/components/site/ContactForm";
import { SiteFrame } from "@/components/site/SiteFrame";
import { apps, appSlug } from "@/lib/apps";
import { aboutDescription, baseOpenGraph, contactEmail, siteName } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";
import { sendContactMessage } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "about",
  description: aboutDescription,
  alternates: { canonical: "/about" },
  openGraph: { ...baseOpenGraph, title: siteName, description: aboutDescription, url: "/about" },
};

// Who runs the site, in the website's frame (SiteFrame, docs/decisions/0016),
// in Light, or the user's theme when logged in: Diogo's initials, name, work
// and city; then what the site is, in his words, with a link to each app; and
// Get in touch, a form that emails him (CONTACT_EMAIL, when set: the address
// itself is never on the page).
export default async function About() {
  const user = await getUser();
  const contact = contactEmail() !== null;
  return (
    <SiteFrame theme={user?.themePreference ?? defaultTheme} user={user} current="about">
      <article className={styles.page}>
        <header className={styles.intro}>
          <Avatar username="diogo" name="Diogo Mota" className={styles.avatar} />
          <p className={styles.eyebrow}>About</p>
          <h1>Diogo Mota</h1>
          <p className={styles.lead}>DevOps engineer based in Lisbon, Portugal</p>
        </header>

        <section className={styles.card} aria-labelledby="about-site">
          <h2 id="about-site">This site</h2>
          <p>
            diogomota.com is where I build small apps for the things we share with the people close to us:{" "}
            {apps.map((app, i) => (
              <span key={app.href}>
                {i > 0 && (i === apps.length - 1 ? ", and " : ", ")}
                <Link href={user ? app.href : `/#${appSlug(app)}`}>{app.name}</Link>, {app.summary}
              </span>
            ))}
            . More are on the way.
          </p>
          <p>
            I make them for my friends and family, and run them myself on a server in Europe. Anyone is welcome to sign
            up; the <Link href="/privacy">Privacy</Link> page says what I keep, and why.
          </p>
        </section>

        {contact && (
          <section id="contact" className={`${styles.card} ${styles.contact}`} aria-labelledby="about-contact">
            <h2 id="about-contact">Get in touch</h2>
            <p>
              Questions, ideas or something that doesn&rsquo;t work? Send me a message and I&rsquo;ll get back to you.
            </p>
            <ContactForm action={sendContactMessage} />
          </section>
        )}
      </article>
    </SiteFrame>
  );
}
