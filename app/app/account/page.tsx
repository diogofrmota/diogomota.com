import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { PasswordForm, ThemeForm, UsernameForm } from "@/components/account/AccountSettings";
import { SitePage } from "@/components/site/SitePage";
import site from "@/components/site/site.module.css";
import { TopBar } from "@/components/site/TopBar";
import { siteViewport } from "@/lib/site";
import { findUserById } from "@/lib/users";
import { logOut } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "account", robots: { index: false } };

export const viewport = siteViewport;

// One setting per dropdown, closed until opened. A native <details>, so it opens
// with a click, Enter or Space and needs no script. The open state is the
// browser's, so it stays open while a form inside it saves and the page re-renders.
function Dropdown({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className={styles.item}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          <h2 id={headingId} className={styles.heading}>
            {title}
          </h2>
        </summary>
        <div className={styles.body}>{children}</div>
      </details>
    </section>
  );
}

// Account settings, opened from the account menu. Like /apps, it is in the site
// style (black, IBM Plex Mono); the theme set here applies inside the apps.
export default async function AccountPage() {
  const { id } = await requireUser("/account");
  const user = await findUserById(id);
  if (!user) notFound();

  return (
    <SitePage>
      <TopBar name="Account" username={user.username} />
      <main className={styles.main}>
        <p className={styles.back}>
          <Link href="/apps">
            <span aria-hidden="true">←</span>Back to Apps
          </Link>
        </p>
        <h1 className={styles.title}>account</h1>

        <div className={styles.list}>
          <Dropdown id="username" title="Change username">
            <UsernameForm username={user.username} />
          </Dropdown>

          <Dropdown id="password" title="Change password">
            <PasswordForm />
          </Dropdown>

          <Dropdown id="forgot" title="Forgot password">
            <p className={site.muted}>
              Don&apos;t know your current password? Reset it with a link sent to {user.email}.
            </p>
            <p className={styles.action}>
              <Link href="/forgot-password" className={site.button}>
                Reset by email
              </Link>
            </p>
          </Dropdown>

          <Dropdown id="theme" title="Theme">
            <ThemeForm theme={user.themePreference} labelledBy="theme-heading" />
          </Dropdown>
        </div>

        <form action={logOut} className={styles.logout}>
          <button type="submit" className={site.button}>
            Logout
          </button>
        </form>
      </main>
    </SitePage>
  );
}
