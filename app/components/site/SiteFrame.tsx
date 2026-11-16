import Image from "next/image";
import Link from "next/link";
import shell from "@/components/common/AppShell.module.css";
import themeStyles from "@/components/common/themes.module.css";
import { apps, appSlug } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { siteTagline } from "@/lib/site";
import { themeBackground, type Theme } from "@/lib/themes";
import { SiteHeader, type SitePage, type SiteUser } from "./SiteHeader";
import styles from "./SiteFrame.module.css";

/**
 * The website's footer: the mark and what the site is, then a column of links
 * each for the apps, the site's pages and the account; under them, the year
 * and which build is live (for whoever deploys it, so out of the way).
 */
function SiteFooter({ user, next }: { user: SiteUser; next?: string | null }) {
  // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
  const version = process.env.APP_VERSION ?? "dev";
  return (
    <footer className={styles.footer}>
      <div className={styles.footerColumns}>
        <div className={styles.footerAbout}>
          <Link href="/" className={styles.footerBrand}>
            <Image src="/icon.svg" alt="" width={24} height={24} unoptimized />
            diogomota
          </Link>
          <p>{siteTagline}, made and run by Diogo Mota in Lisbon.</p>
        </div>
        <nav aria-label="Footer" className={styles.footerLinks}>
          <div>
            <h2>Apps</h2>
            <ul>
              {apps.map((app) => (
                <li key={app.href}>
                  <Link href={user ? app.href : `/#${appSlug(app)}`}>{app.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Site</h2>
            <ul>
              {!user && (
                <li>
                  <Link href="/#how-it-works">How it works</Link>
                </li>
              )}
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Account</h2>
            <ul>
              {user ? (
                <>
                  <li>
                    <Link href="/">Your apps</Link>
                  </li>
                  <li>
                    <Link href="/account">Account</Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link href={authHref("/login", next)}>Log in</Link>
                  </li>
                  <li>
                    <Link href={authHref("/signup", next)}>Sign up</Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>
      </div>
      <div className={styles.footerBase}>
        <span>© {new Date().getFullYear()} Diogo Mota</span>
        <span data-numeric>Version {version}</span>
      </div>
    </footer>
  );
}

/**
 * The website (docs/decisions/0016): the front page (home, logged out), /about,
 * and /privacy logged out. A header with the site's links and Log in and Sign
 * up (SiteHeader), the page, and a footer of links, in the theme given (Light
 * logged out, the user's own logged in) and on the apps' scales
 * (AppShell.module.css's shell), so its parts are the apps' parts. The apps,
 * and the pages around them, are in their own frame (AppFrame).
 */
export function SiteFrame({
  theme,
  user,
  next,
  current,
  children,
}: {
  theme: Theme;
  user: SiteUser;
  /** Where Log in and Sign up return to. */
  next?: string | null;
  /** The page shown, if it is one of the header's. */
  current?: SitePage;
  children: React.ReactNode;
}) {
  return (
    <div className={`${themeStyles.theme} ${shell.shell} ${styles.frame}`} data-theme={theme}>
      {/* Browser UI color on mobile. React moves it into <head>. */}
      <meta name="theme-color" content={themeBackground(theme)} />
      <SiteHeader user={user} next={next} current={current} />
      <main className={styles.main}>{children}</main>
      <SiteFooter user={user} next={next} />
    </div>
  );
}
