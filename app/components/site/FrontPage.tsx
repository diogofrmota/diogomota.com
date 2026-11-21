import Link from "next/link";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { appAt } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { siteLead, siteTagline } from "@/lib/site";
import { AppSections } from "./AppSections";
import { HomeScreenGuide } from "./HomeScreenGuide";
import styles from "./FrontPage.module.css";

const steps = [
  ["Sign up", "Your name, a username, your email and a password. Then confirm your email."],
  ["Pick an app", "Every app is there from the start, on your phone or your computer."],
  [
    "Invite your friends",
    "Invite your partner to your shared Calendar, or add friends in Shows or Books to share what you read and watch.",
  ],
] as const;

/**
 * The front page (home, logged out; docs/decisions/0016), in the website's
 * frame (SiteFrame): what the site is, Sign up and Login; then the apps in
 * three groups (AppSections: For Couples, Trackers, Health), How it works,
 * How to add to Home Screen (HomeScreenGuide, step by step on an iPhone), and
 * Sign up once more. `next` (from a protected page) makes Log in and Sign up
 * return there, and opens the prompt of the app it is in.
 */
export function FrontPage({ next, deleted }: { next: string | null; deleted: boolean }) {
  return (
    <>
      {deleted && (
        // Just deleted (app/account/actions.ts, deleteAccount): logged out, and told so.
        <p role="status" className={`${ui.success} ${styles.deleted}`}>
          Your account and everything it had here were deleted.
        </p>
      )}

      <section className={styles.hero} aria-labelledby="hero-title">
        <h1 id="hero-title">{siteTagline}</h1>
        <p className={styles.lead}>{siteLead}</p>
        <div className={styles.ctas}>
          <Link href={authHref("/signup", next)} className={`${ui.button} ${ui.primary} ${styles.big}`}>
            Sign up
            <LinkPending />
          </Link>
          <Link href={authHref("/login", next)} className={`${ui.button} ${styles.big}`}>
            Login
            <LinkPending />
          </Link>
        </div>
      </section>

      <section id="apps" className={styles.section} aria-labelledby="apps-title">
        <h2 id="apps-title" className={ui.srOnly}>
          The apps
        </h2>
        <AppSections prompted={appAt(next)?.href} />
      </section>

      <section id="how-it-works" className={styles.section} aria-labelledby="how-it-works-title">
        <h2 id="how-it-works-title" className={styles.heading}>
          How it works
        </h2>
        <ol className={styles.steps}>
          {steps.map(([title, text], i) => (
            <li key={title} className={styles.step}>
              {/* The number, then the title beside it; the words under both. */}
              <span className={styles.stepNumber} aria-hidden="true">
                {i + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="home-screen" className={styles.section} aria-labelledby="home-screen-title">
        <h2 id="home-screen-title" className={styles.heading}>
          How to add to Home Screen
        </h2>
        <p className={styles.sectionLead}>
          On an iPhone, in Safari: then it opens from your Home Screen like an app of its own.
        </p>
        <HomeScreenGuide />
      </section>

      <section className={`${styles.section} ${styles.band}`} aria-labelledby="band-title">
        <div>
          <h2 id="band-title">Try it now and join the community</h2>
          <p>It takes a minute to sign up.</p>
        </div>
        <Link href={authHref("/signup", next)} className={`${ui.button} ${styles.big} ${styles.bandButton}`}>
          Sign up
          <LinkPending />
        </Link>
      </section>
    </>
  );
}
