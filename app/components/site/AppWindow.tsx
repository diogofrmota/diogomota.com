import { AppPreview } from "./AppPreview";
import styles from "./FrontPage.module.css";

/**
 * A picture of an app in a browser window, on the front page: the window's
 * bar with the app's address, then the app's picture (AppPreview), drawn in
 * the page's theme and scaled up with the window (--preview-zoom).
 * Decorative: the section around it says what the app is.
 */
export function AppWindow({ href, className = "" }: { href: string; className?: string }) {
  return (
    <div className={`${styles.window} ${className}`} aria-hidden="true">
      <div className={styles.windowBar}>
        <span />
        <span />
        <span />
        <span className={styles.address}>diogomota.com{href}</span>
      </div>
      <AppPreview href={href} className={styles.windowPreview} />
    </div>
  );
}
