import Link from "next/link";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { authHref } from "@/lib/next-path";
import styles from "./LoginCallout.module.css";

// Over the app cards on /apps while logged out: what an account gets you, then
// Log in and Sign up side by side, as everywhere (the top bar, an app's login
// prompt): Log in plain and first, Sign up filled after it; both return to
// `next`. In the page's theme; the accent border marks it apart from the cards,
// which open the apps.
export function LoginCallout({ next }: { next?: string | null }) {
  return (
    <section aria-labelledby="login-callout" className={styles.callout}>
      <h2 id="login-callout" className={styles.title}>
        One account for all apps
      </h2>
      <p className={styles.description}>
        Plan together as a couple in a shared calendar and task lists, and keep track of what you watch with your
        friends.
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
