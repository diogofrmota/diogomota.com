import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { authHref } from "@/lib/next-path";
import { LinkPending } from "./LinkPending";
import { siteDomain } from "@/lib/site";
import styles from "./AppHeader.module.css";

/**
 * A nav item's label. The current item is bold; a hidden bold copy keeps its
 * width the same either way, so nothing in the bar moves when it changes.
 */
export function NavLabel({ children }: { children: string }) {
  return <span className={styles.label}>
    <span className={styles.text}>{children}</span>
    <span aria-hidden="true" className={styles.sizer}>{children}</span>
  </span>;
}

/**
 * The one top bar of the apps and the pages around them, at every width.
 * Inside an app, the app's tabs (HeaderTabs) in the middle; on /apps,
 * /account and the login pages, diogomota.com on the left. On the right, the
 * account menu (where Switch app goes to /apps, except on /apps itself), or
 * Log in and Sign up, the call to action: a filled pill, as tall as the
 * account menu's.
 */
export function AppHeader({ pathname, username, avatarUrl, next, tabs, brand = true, account = true }: {
  /** The page's path: /apps has no Switch app. */
  pathname?: string;
  username: string | null;
  /** The user's profile picture, in place of their initial in the account menu. */
  avatarUrl?: string | null;
  next?: string | null;
  /** The open app's tabs (HeaderTabs), in the middle. */
  tabs?: React.ReactNode;
  /** diogomota.com on the left. The apps leave it out. */
  brand?: boolean;
  /** The account menu, or Log in and Sign up. The login pages leave it out. */
  account?: boolean;
}) {
  return <header className={`${styles.header} ${tabs ? styles.withTabs : ""}`}>
    <div className={styles.start}>
      {brand && <Link href="/" className={styles.brand}>{siteDomain}</Link>}
    </div>
    {tabs}
    {account && <nav aria-label="Account" className={styles.account}>
      {username ? <AccountMenu username={username} avatarUrl={avatarUrl} switchApp={pathname !== "/apps"} /> : <>
        <Link href={authHref("/login", next)} className={styles.authLink}>Log in<LinkPending /></Link>
        <Link href={authHref("/signup", next)} className={`${styles.authLink} ${styles.cta}`}>
          <span className={styles.ctaPill}>Sign up<LinkPending /></span>
        </Link>
      </>}
    </nav>}
  </header>;
}
