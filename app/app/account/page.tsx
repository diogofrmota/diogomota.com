import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AccountSettings } from "@/components/account/AccountSettings";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { appViewport } from "@/lib/apps";
import { findUserById } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "account", robots: { index: false } };

export const viewport = appViewport;

// Account settings, opened from Account in the tab bar of /apps. Like /apps, in
// the apps' frame and the user's theme, which is set here (and only here), with
// the same tab bar (Account current, Apps the way back) and no top bar. The
// title, then the settings, each opening a popup (AccountSettings), and Log out.
// What an emailed link did, when it comes back here (auth.ts, app/account/actions.ts).
const messages: Record<string, string> = {
  changed: "Your email is changed.",
  confirmed: "Your email is confirmed.",
};

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { id } = await requireUser("/account");
  const { email, error } = await searchParams;
  const message =
    typeof error === "string"
      ? "That link has expired or was already used. Send yourself a new one."
      : typeof email === "string"
        ? messages[email]
        : undefined;
  const user = await findUserById(id);
  if (!user) notFound();

  return (
    <AppFrame theme={user.themePreference} username={user.username} avatarUrl={user.avatarUrl} launcher="account">
      <div className={`${ui.view} ${styles.page}`}>
        <h1 className={`${ui.heading} ${styles.title}`}>Account</h1>
        <AccountSettings user={user} message={message} />
      </div>
    </AppFrame>
  );
}
