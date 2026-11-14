import Link from "next/link";
import { getUser } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import type { LauncherTab } from "@/components/common/HeaderTabs";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { defaultTheme } from "@/lib/themes";
import styles from "./AuthPage.module.css";

// Frame for /login, /signup, the password reset pages and an invite, in the
// apps' frame and look, with the tab bar of the pages around the apps (Log in,
// Sign up and Home, this page's tab marked; Account and Home logged in), then a
// centered column with the form in a card (its button as wide as the card: the
// page's one action) and a few lines under it. In the default theme, unless
// the user is logged in (the reset pages and invites are open then too): then
// in theirs.
export async function AuthPage({
  title,
  intro,
  form,
  children,
  action,
  current,
  next,
}: {
  title: string;
  /** A line between the title and the form. */
  intro?: React.ReactNode;
  form?: React.ReactNode;
  /** Short lines under the form. */
  children?: React.ReactNode;
  /** The page's action as a button, for a page without a form (an expired reset link). */
  action?: { href: string; label: string };
  /** /login or /signup: its tab in the tab bar is the current one. */
  current?: Extract<LauncherTab, "login" | "signup">;
  /** Where the tab bar's Log in and Sign up return to. */
  next?: string | null;
}) {
  const user = await getUser();
  return (
    <AppFrame
      theme={user?.themePreference ?? defaultTheme}
      username={user?.username ?? null}
      name={user?.name}
      avatarUrl={user?.avatarUrl}
      current={current}
      next={next}
    >
      <div className={styles.column}>
        <h1 className={`${ui.heading} ${styles.title}`}>{title}</h1>
        {intro && <p className={`${ui.muted} ${styles.intro}`}>{intro}</p>}
        {form && <div className={ui.card}>{form}</div>}
        {children && <div className={`${ui.muted} ${styles.links}`}>{children}</div>}
        {action && (
          <p className={styles.action}>
            <Link href={action.href} className={`${ui.button} ${ui.primary} ${styles.wide}`}>
              {action.label}
              <LinkPending />
            </Link>
          </p>
        )}
      </div>
    </AppFrame>
  );
}
