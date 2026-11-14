import Link from "next/link";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { authHref } from "@/lib/next-path";
import styles from "./Hero.module.css";

// The top of the front page (home, logged out): what the site is, in a line,
// then Log in and Sign up side by side, as everywhere (the tab bar, an app's
// login prompt): Log in plain and first, Sign up filled after it; both return
// to `next`. The app cards under it open the apps.
export function Hero({ next }: { next?: string | null }) {
  return (
    <section aria-labelledby="hero-title" className={styles.hero}>
      <h1 id="hero-title" className={styles.title}>
        Small apps for friends
      </h1>
      <p className={styles.description}>
        A shared calendar and task lists for couples, and a way to keep track of what you watch with your friends.
      </p>
      <div className={styles.actions}>
        <Link href={authHref("/login", next)} className={`${ui.button} ${styles.action}`}>
          Log in
          <LinkPending />
        </Link>
        <Link href={authHref("/signup", next)} className={`${ui.button} ${ui.primary} ${styles.action}`}>
          Sign up
          <LinkPending />
        </Link>
      </div>
    </section>
  );
}
