import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { PasswordForm, ThemeForm, UsernameForm } from "@/components/account/AccountSettings";
import { Brackets, SitePage } from "@/components/site/SitePage";
import site from "@/components/site/site.module.css";
import { TopBar } from "@/components/site/TopBar";
import { siteViewport } from "@/lib/site";
import { findUserById } from "@/lib/users";
import { logOut } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "account", robots: { index: false } };

export const viewport = siteViewport;

// Account settings, opened from the account menu. Like /apps, it is in the site
// style (black, IBM Plex Mono); the theme set here applies inside the apps.
export default async function AccountPage() {
  const { id } = await requireUser("/account");
  const user = await findUserById(id);
  if (!user) notFound();

  return (
    <SitePage>
      <TopBar username={user.username} />
      <main className={styles.main}>
        <p className={styles.back}>
          <Link href="/apps">
            <span aria-hidden="true">←</span>Back to Apps
          </Link>
        </p>
        <h1 className={styles.title}>account</h1>

        <section aria-labelledby="username-heading" className={styles.section}>
          <h2 id="username-heading" className={styles.heading}>
            Change username
          </h2>
          <UsernameForm username={user.username} />
        </section>

        <section aria-labelledby="password-heading" className={styles.section}>
          <h2 id="password-heading" className={styles.heading}>
            Change password
          </h2>
          <PasswordForm />
        </section>

        <section aria-labelledby="forgot-heading" className={styles.section}>
          <h2 id="forgot-heading" className={styles.heading}>
            Forgot password
          </h2>
          <p className={site.muted}>
            Don&apos;t know your current password? Reset it with a link sent to {user.email}.
          </p>
          <p className={styles.action}>
            <Link href="/forgot-password" className={site.bracket}>
              <Brackets>Reset by email</Brackets>
            </Link>
          </p>
        </section>

        <section aria-labelledby="theme-heading" className={styles.section}>
          <h2 id="theme-heading" className={styles.heading}>
            Theme
          </h2>
          <ThemeForm theme={user.themePreference} labelledBy="theme-heading" />
        </section>

        <section aria-labelledby="logout-heading" className={styles.section}>
          <h2 id="logout-heading" className={styles.heading}>
            Log out
          </h2>
          <form action={logOut}>
            <button type="submit" className={`${site.bracket} ${styles.logout}`}>
              <Brackets>Logout</Brackets>
            </button>
          </form>
        </section>
      </main>
    </SitePage>
  );
}
