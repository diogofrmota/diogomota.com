import Link from "next/link";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { appAt } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { siteLead, siteTagline } from "@/lib/site";
import { AppSections } from "./AppSections";
import styles from "./FrontPage.module.css";

const steps = [
  ["Sign up", "Your name, a username, your email and a password. Then confirm your email."],
  ["Pick an app", "Every app is there from the start, on your phone or your computer."],
  [
    "Bring your people",
    "Invite your partner to your Shared space, or add friends in Shows or Books to share what you read and watch.",
  ],
] as const;

const questions: { question: string; answer: React.ReactNode }[] = [
  {
    question: "Who runs it?",
    answer: (
      <>
        Diogo. The apps are made for friends and family, and anyone can sign up. More on the{" "}
        <Link href="/about">About</Link> page.
      </>
    ),
  },
  {
    question: "Is my data private?",
    answer: (
      <>
        No ads, no analytics and no tracking cookies. The site runs on a server in Europe, and nobody sells or shares
        your data. The <Link href="/privacy">Privacy</Link> page has the details.
      </>
    ),
  },
  {
    question: "Can I use it on my phone?",
    answer:
      "Yes. Add it to your home screen and it opens like an app of its own, and your personal libraries keep working offline. Profiles and friends need a connection.",
  },
  {
    question: "Can I take my data with me?",
    answer:
      "Yes. In Account, Data / Privacy page has Download my data, a file with all of it, and Delete my account, which deletes it all at once.",
  },
];

/**
 * The front page (home, logged out; docs/decisions/0016), in the website's
 * frame (SiteFrame): what the site is, Sign up and Login; then a section per
 * app (AppSections, with its picture on a wider screen), How it works, Questions,
 * and Sign up once more. `next` (from a protected page) makes Log in and Sign
 * up return there, and opens the prompt of the app it is in.
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
              <span className={styles.stepNumber} aria-hidden="true">
                {i + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="questions" className={styles.section} aria-labelledby="questions-title">
        <h2 id="questions-title" className={styles.heading}>
          Questions
        </h2>
        <div className={styles.questions}>
          {questions.map(({ question, answer }) => (
            <div key={question}>
              <h3>{question}</h3>
              <p>{answer}</p>
            </div>
          ))}
        </div>
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
