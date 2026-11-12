import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AccountSettings } from "@/components/account/AccountSettings";
import { AppFrame } from "@/components/common/AppShell";
import { ChevronLeftIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import { appViewport } from "@/lib/apps";
import { findUserById } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "account", robots: { index: false } };

export const viewport = appViewport;

// Account settings, opened from the account menu. Like /apps, in the apps'
// frame and the user's theme, which is set here (and only here). The way back,
// the title, then the settings, each opening a popup (AccountSettings).
export default async function AccountPage() {
  const { id } = await requireUser("/account");
  const user = await findUserById(id);
  if (!user) notFound();

  return (
    <AppFrame theme={user.themePreference} username={user.username} avatarUrl={user.avatarUrl}>
      <div className={`${ui.view} ${styles.page}`}>
        <p className={styles.back}>
          <Link href="/apps" className={`${ui.button} ${ui.quiet}`}>
            <LinkPending icon={<ChevronLeftIcon />} />
            Back to apps
          </Link>
        </p>
        <h1 className={`${ui.heading} ${styles.title}`}>Account</h1>
        <AccountSettings user={user} />
      </div>
    </AppFrame>
  );
}
