import Link from "next/link";
import ui from "@/components/common/ui.module.css";
import { authHref } from "@/lib/next-path";
import styles from "./LoginCallout.module.css";

// Over the app cards on /apps while logged out: what an account is for, then
// Login and Sign Up side by side (as in the top bar, they return to `next`).
// In the page's theme; the accent border marks it apart from the cards, which
// open the apps.
export function LoginCallout({ next }: { next?: string | null }) {
  return (
    <section aria-labelledby="login-callout" className={styles.callout}>
      <h2 id="login-callout" className={styles.title}>
        Create an account to start using the apps
      </h2>
      <p className={styles.description}>
        To use the apps you need to create an account. Log in, or sign up if you are a new user.
      </p>
      <div className={styles.actions}>
        <Link href={authHref("/login", next)} className={`${ui.button} ${ui.primary} ${styles.action}`}>
          Login
        </Link>
        <Link href={authHref("/signup", next)} className={`${ui.button} ${styles.action}`}>
          Sign Up
        </Link>
      </div>
    </section>
  );
}
