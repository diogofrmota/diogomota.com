import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/common/Avatar";
import { ChevronDownIcon, MenuIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { apps, appSlug } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { SiteMenu } from "./SiteMenu";
import styles from "./SiteHeader.module.css";

/** Who is looking at the website: null logged out. */
export type SiteUser = { username: string; name?: string | null; avatarUrl?: string | null } | null;

/** The website's pages that are in its header or menu, when one is showing. */
export type SitePage = "home" | "about" | "privacy";

/** Where an app's link goes: its section of the front page, or the app itself once logged in. */
const appHref = (app: (typeof apps)[number], user: SiteUser) => (user ? app.href : `/#${appSlug(app)}`);

/** The apps, each its icon, name and what it is: in Apps, and in the menu on a phone. */
function AppLinks({ user }: { user: SiteUser }) {
  return (
    <ul className={styles.appLinks}>
      {apps.map((app) => (
        <li key={app.href}>
          <Link href={appHref(app, user)} className={styles.appLink}>
            <Image src={app.logo} alt="" width={40} height={40} className={styles.appIcon} />
            <span>
              <span className={styles.appName}>{app.name}</span>{" "}
              <span className={styles.appDescription}>{app.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The website's header (SiteFrame): the dm mark and diogomota (home) on the
 * left, then Apps (a menu of them), How it works and About; on the right, Log
 * in (plain) and Sign up (filled), as everywhere, or Account and Your apps once
 * logged in. On a phone: the mark, Sign up (or Your apps) and a menu with the
 * rest, its links (How it works, About, Privacy, Log in) over the apps. Log in
 * and Sign up return to `next`.
 */
export function SiteHeader({ user, next, current }: { user: SiteUser; next?: string | null; current?: SitePage }) {
  const here = (page: SitePage) => (current === page ? ("page" as const) : undefined);
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.brand} aria-current={here("home")}>
          {/* The site's icon (app/icon.svg), as in the browser's tab. */}
          <Image src="/icon.svg" alt="" width={28} height={28} className={styles.mark} unoptimized />
          diogomota
        </Link>

        <nav aria-label="Site" className={styles.nav}>
          <ul>
            <li>
              <SiteMenu
                label={
                  <>
                    Apps
                    <ChevronDownIcon />
                  </>
                }
                className={styles.navButton}
                panelClassName={`${styles.panel} ${styles.appsPanel}`}
              >
                <AppLinks user={user} />
              </SiteMenu>
            </li>
            {!user && (
              <li>
                <Link href="/#how-it-works" className={styles.navLink}>
                  How it works
                </Link>
              </li>
            )}
            <li>
              <Link href="/about" className={styles.navLink} aria-current={here("about")}>
                About
              </Link>
            </li>
          </ul>
        </nav>

        <div className={styles.actions}>
          {user ? (
            <>
              <Link href="/account" className={`${ui.button} ${styles.plain} ${styles.account}`}>
                <Avatar username={user.username} name={user.name} url={user.avatarUrl} className={styles.avatar} />
                <span className={styles.wide}>Account</span>
                <LinkPending />
              </Link>
              <Link href="/" className={`${ui.button} ${ui.primary}`}>
                Your apps
                <LinkPending />
              </Link>
            </>
          ) : (
            <>
              <Link href={authHref("/login", next)} className={`${ui.button} ${styles.plain} ${styles.wide}`}>
                Log in
                <LinkPending />
              </Link>
              <Link href={authHref("/signup", next)} className={`${ui.button} ${ui.primary}`}>
                Sign up
                <LinkPending />
              </Link>
            </>
          )}
          {/* On a phone, the rest of the header in a menu. */}
          <SiteMenu
            label={<MenuIcon />}
            buttonLabel="Menu"
            className={styles.menuButton}
            panelClassName={`${styles.panel} ${styles.menuPanel}`}
          >
            {/* The site's links first, then the apps. */}
            <nav aria-label="Menu">
              <ul className={styles.menuLinks}>
                {!user && (
                  <li>
                    <Link href="/#how-it-works">How it works</Link>
                  </li>
                )}
                <li>
                  <Link href="/about" aria-current={here("about")}>
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" aria-current={here("privacy")}>
                    Privacy
                  </Link>
                </li>
                <li>
                  {user ? <Link href="/account">Account</Link> : <Link href={authHref("/login", next)}>Log in</Link>}
                </li>
              </ul>
              <AppLinks user={user} />
            </nav>
          </SiteMenu>
        </div>
      </div>
    </header>
  );
}
