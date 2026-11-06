import Link from "next/link";
import { UserIcon } from "@/components/common/icons";
import ui from "@/components/common/ui.module.css";
import type { AppInfo } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import styles from "./LoginCallout.module.css";

// Over the app cards on /apps while logged out: what an account is for, with
// Login and Sign Up (as in the top bar, they return to `next`). In the page's
// theme; the accent marks it apart from the cards, which open the apps.
export function LoginCallout({ apps, next }: { apps: readonly AppInfo[]; next?: string | null }) {
  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(apps.map((app) => app.name));
  return (
    <section aria-labelledby="login-callout" className={styles.callout}>
      <span className={styles.icon}>
        <UserIcon />
      </span>
      <div className={styles.text}>
        <h2 id="login-callout" className={styles.title}>
          Log in to use the apps
        </h2>
        <p className={styles.description}>
          {names} need an account. Log in, or sign up if you are new.
        </p>
      </div>
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
