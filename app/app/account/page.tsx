import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AvatarForm, NameForm, PasswordForm, ThemeForm, UsernameForm } from "@/components/account/AccountSettings";
import { LogoutButton } from "@/components/account/LogoutButton";
import { AppFrame } from "@/components/common/AppShell";
import { Avatar } from "@/components/common/Avatar";
import { ChevronDownIcon, ChevronLeftIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { appViewport } from "@/lib/apps";
import { fullName } from "@/lib/names";
import { themes } from "@/lib/themes";
import { findUserById } from "@/lib/users";
import { logOut } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "account", robots: { index: false } };

export const viewport = appViewport;

// One setting per dropdown, closed until opened, named by what it sets, with
// its current value (if it has one to show) before the chevron. A native
// <details>, so it opens with a click, Enter or Space and needs no script. The
// open state is the browser's, so it stays open while a form inside it saves
// and the page re-renders.
function Dropdown({ id, title, value, children }: {
  id: string;
  title: string;
  value?: string;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className={styles.item}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          <h2 id={headingId} className={styles.heading}>
            {title}
          </h2>
          {value && <span className={styles.value}>{value}</span>}
          <span className={styles.chevron}>
            <ChevronDownIcon />
          </span>
        </summary>
        <div className={styles.body}>{children}</div>
      </details>
    </section>
  );
}

// Account settings, opened from the account menu. Like /apps, in the apps'
// frame and the user's theme, which is set here (and only here). Who is logged
// in, under the title; then the settings; then, set apart, Log out.
export default async function AccountPage() {
  const { id } = await requireUser("/account");
  const user = await findUserById(id);
  if (!user) notFound();
  const theme = themes.find((info) => info.id === user.themePreference);

  return (
    <AppFrame theme={user.themePreference} username={user.username} avatarUrl={user.avatarUrl}>
      <div className={ui.view}>
        <p className={styles.back}>
          <Link href="/apps" className={`${ui.button} ${ui.quiet}`}>
            <LinkPending icon={<ChevronLeftIcon />} />
            Back to apps
          </Link>
        </p>
        <h1 className={`${ui.heading} ${styles.title}`}>Account</h1>
        <div className={styles.identity}>
          <Avatar username={user.username} url={user.avatarUrl} className={styles.avatar} />
          <p className={styles.who}>
            <span className={styles.username}>{user.username}</span>
            <span className={styles.email}>{user.email}</span>
          </p>
        </div>

        <div className={styles.list}>
          <Dropdown id="name" title="Name" value={fullName(user) ?? undefined}>
            <NameForm firstName={user.firstName} lastName={user.lastName} />
          </Dropdown>

          <Dropdown id="username" title="Username">
            <UsernameForm username={user.username} />
          </Dropdown>

          <Dropdown id="password" title="Password">
            <PasswordForm />
            <p className={styles.forgot}>
              Don&apos;t know your current password? <Link href="/forgot-password">Reset it by email</Link>
            </p>
          </Dropdown>

          <Dropdown id="avatar" title="Profile picture">
            <AvatarForm username={user.username} avatarUrl={user.avatarUrl} />
          </Dropdown>

          <Dropdown id="theme" title="Theme" value={theme?.name}>
            <ThemeForm theme={user.themePreference} labelledBy="theme-heading" />
          </Dropdown>
        </div>

        <form action={logOut} className={styles.logout}>
          <LogoutButton className={ui.button} />
        </form>
      </div>
    </AppFrame>
  );
}
