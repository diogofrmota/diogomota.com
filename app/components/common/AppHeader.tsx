import Link from "next/link";
import { AccountMenu } from "@/components/account/AccountMenu";
import { apps, settingsHref } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
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
 * The one top bar of the apps and the pages around them, at every width. On
 * the left, inside an app, the app's tabs (HeaderTabs); on /apps, /settings,
 * /account and the login pages, diogomota.com. On the right, the account menu
 * (where Switch apps goes back to /apps), or Login and Sign Up.
 */
export function AppHeader({ pathname, username, next, tabs, brand = true, account = true }: {
  /** The page's path, to open Settings on the app it belongs to. */
  pathname?: string;
  username: string | null;
  next?: string | null;
  /** The open app's tabs (HeaderTabs), on the left. */
  tabs?: React.ReactNode;
  /** diogomota.com on the left. The apps leave it out. */
  brand?: boolean;
  /** The account menu, or Login and Sign Up. The login pages leave it out. */
  account?: boolean;
}) {
  const open = apps.find((app) => pathname === app.href || pathname?.startsWith(`${app.href}/`));
  return <header className={styles.header}>
    <div className={styles.start}>
      {brand && <Link href="/" className={styles.brand}>{siteDomain}</Link>}
      {tabs}
    </div>
    {account && <nav aria-label="Account" className={styles.account}>
      {username ? <AccountMenu username={username} settingsHref={settingsHref(open)} /> : <>
        <Link href={authHref("/login", next)} className={styles.authLink}>Login</Link>
        <Link href={authHref("/signup", next)} className={styles.authLink}>Sign Up</Link>
      </>}
    </nav>}
  </header>;
}
