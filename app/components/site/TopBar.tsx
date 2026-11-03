import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { authHref } from "@/lib/next-path";
import { siteName } from "@/lib/site";
import site from "./site.module.css";
import styles from "./TopBar.module.css";

// Top bar of /apps and /account. Logged out: Login | Sign Up, which send the
// user on to `next` afterwards. Logged in: the username and its account menu.
export function TopBar({ username, next }: { username: string | null; next?: string | null }) {
  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.home}>
        {siteName}
      </Link>
      <nav aria-label="Account" className={styles.account}>
        {username ? (
          <AccountMenu username={username} />
        ) : (
          <>
            <Link href={authHref("/login", next)} className={site.button}>
              Login
            </Link>
            <Link href={authHref("/signup", next)} className={site.button}>
              Sign Up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
