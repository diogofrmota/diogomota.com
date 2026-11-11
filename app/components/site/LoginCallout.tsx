import Link from "next/link";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { appNames } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import styles from "./LoginCallout.module.css";

// Over the app cards on /apps while logged out: what an account gets you, then
// Sign up (the call to action, for the newcomer this is for) and Log in side by
// side (as in the top bar, they return to `next`). In the page's theme; the
// accent border marks it apart from the cards, which open the apps.
export function LoginCallout({ next }: { next?: string | null }) {
  return (
    <section aria-labelledby="login-callout" className={styles.callout}>
      <h2 id="login-callout" className={styles.title}>
        One account for {appNames}
      </h2>
      <p className={styles.description}>
        Plan with your group in a shared calendar and task lists, and keep track of what you watch.
      </p>
      <div className={styles.actions}>
        <Link href={authHref("/signup", next)} className={`${ui.button} ${ui.primary} ${styles.action}`}>
          Sign up
          <LinkPending />
        </Link>
        <Link href={authHref("/login", next)} className={`${ui.button} ${styles.action}`}>
          Log in
          <LinkPending />
        </Link>
      </div>
    </section>
  );
}
