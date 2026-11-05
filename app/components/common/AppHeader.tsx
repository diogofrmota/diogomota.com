import Link from "next/link";
import { AccountMenu, type AppSettingsAction } from "@/components/account/AccountMenu";
import { authHref } from "@/lib/next-path";
import { BackIcon } from "./icons";
import styles from "./AppHeader.module.css";

/** One header layout for the app directory and every application. */
export function AppHeader({ name, back, username, next, actions, settings }: {
  name: string;
  back: { href: string; label: string; ariaLabel?: string };
  username: string | null;
  next?: string | null;
  actions?: React.ReactNode;
  settings?: AppSettingsAction;
}) {
  return <header className={styles.header}>
    <Link href={back.href} className={styles.back} aria-label={back.ariaLabel}>
      <BackIcon />{back.label}
    </Link>
    <span className={styles.name}>{name}</span>
    <div className={styles.actions}>
      {actions}
      <nav aria-label="Account" className={styles.account}>
        {username ? <AccountMenu username={username} settings={settings} /> : <>
          <Link href={authHref("/login", next)} className={styles.authLink}>Login</Link>
          <Link href={authHref("/signup", next)} className={styles.authLink}>Sign Up</Link>
        </>}
      </nav>
    </div>
  </header>;
}
