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
 * The one top bar of the site's pages and the apps: diogomota.com, the apps
 * (the open one in bold and underlined), the open app's tabs in the middle on
 * wide screens, and the account menu on the right.
 */
export function AppHeader({ pathname, username, next, tabs, actions }: {
  /** The page's path, to mark the app it belongs to. */
  pathname?: string;
  username: string | null;
  next?: string | null;
  /** The open app's tabs (HeaderTabs). */
  tabs?: React.ReactNode;
  /** The app's own buttons, before the account menu. */
  actions?: React.ReactNode;
}) {
  const open = apps.find((app) => pathname === app.href || pathname?.startsWith(`${app.href}/`));
  return <header className={styles.header}>
    <div className={styles.start}>
      <Link href="/" className={styles.brand}>{siteDomain}</Link>
      <nav aria-label="Apps" className={styles.apps}>
        {apps.map((app) => <Link key={app.href} href={app.href} className={styles.link} aria-current={app === open ? "page" : undefined}>
          <NavLabel>{app.name}</NavLabel>
        </Link>)}
      </nav>
    </div>
    {tabs}
    <div className={styles.end}>
      {actions}
      <nav aria-label="Account" className={styles.account}>
        {username ? <AccountMenu username={username} settingsHref={settingsHref(open)} /> : <>
          <Link href={authHref("/login", next)} className={styles.authLink}>Login</Link>
          <Link href={authHref("/signup", next)} className={styles.authLink}>Sign Up</Link>
        </>}
      </nav>
    </div>
  </header>;
}
