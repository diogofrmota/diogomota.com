import shell from "@/components/common/AppShell.module.css";
import themeStyles from "@/components/common/themes.module.css";
import { themeBackground, type Theme } from "@/lib/themes";
import { SiteHeader, type SitePage, type SiteUser } from "./SiteHeader";
import styles from "./SiteFrame.module.css";

/** The website's footer: the year and which build is live. */
function SiteFooter() {
  // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
  const version = process.env.APP_VERSION ?? "dev";
  return (
    <footer className={styles.footer}>
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
 * up (SiteHeader), the page, and a footer with the year and version, in the theme given (Light
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
      <SiteFooter />
    </div>
  );
}
