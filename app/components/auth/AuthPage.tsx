import Link from "next/link";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import type { Theme } from "@/lib/themes";
import styles from "./AuthPage.module.css";

// Frame for /login, /signup and the password reset pages, in the apps' frame
// and look: the top bar with only diogomota.com (these pages are the way to log
// in), then a centered column with the form in a card, a few lines of links
// under it, and a way back to /apps. Dark, unless the user is logged in (the
// reset pages are open then too) and chose light.
export function AuthPage({
  title,
  intro,
  form,
  children,
  action,
  theme = "dark",
}: {
  title: string;
  /** A line between the title and the form. */
  intro?: React.ReactNode;
  form?: React.ReactNode;
  /** Short lines under the form. */
  children?: React.ReactNode;
  /** The page's action as a button, for a page without a form (an expired reset link). */
  action?: { href: string; label: string };
  theme?: Theme;
}) {
  return (
    <AppFrame theme={theme} username={null} account={false}>
      <div className={styles.column}>
        <h1 className={ui.heading}>{title}</h1>
        {intro && <p className={`${ui.muted} ${styles.intro}`}>{intro}</p>}
        {form && <div className={ui.card}>{form}</div>}
        {children && <div className={`${ui.muted} ${styles.links}`}>{children}</div>}
        <p className={`${ui.actions} ${styles.back}`}>
          {action && (
            <Link href={action.href} className={`${ui.button} ${ui.primary}`}>
              {action.label}
            </Link>
          )}
          <Link href="/apps" className={ui.button}>
            Back to Apps
          </Link>
        </p>
      </div>
    </AppFrame>
  );
}
