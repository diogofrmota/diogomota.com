import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import { CouplesSettingsPage } from "@/components/shared/CouplesSettings";
import { appViewport } from "@/lib/apps";
import { readSpace } from "@/lib/spaces";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "group settings", robots: { index: false } };
export const viewport = appViewport;

// For Couples' settings (docs/decisions/0023), opened from the gear in its
// folder on home: the group's members, inviting your partner, the calendar's
// import and subscription, recent activity and leaving. It was Calendar's
// Settings tab (/shared/settings, which redirects here: next.config.ts). In the
// frame of the pages around the apps, as /account is: Account and Apps.
// Without a group, creating or joining one.
export default async function CouplesPage() {
  const { id } = await requireUser("/couples");
  const [user, space] = await Promise.all([findUserById(id), readSpace(id)]);
  if (!user) notFound();
  return (
    <AppFrame theme={user.themePreference} username={user.username} name={user.name} avatarUrl={user.avatarUrl}>
      <CouplesSettingsPage userId={user.id} initialSpace={space} version={process.env.APP_VERSION ?? "dev"} />
    </AppFrame>
  );
}
