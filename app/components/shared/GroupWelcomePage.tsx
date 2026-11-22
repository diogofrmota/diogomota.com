"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AppFrame } from "@/components/common/AppShell";
import { OfflineSupport } from "@/components/common/OfflineSupport";
import type { Theme } from "@/lib/themes";
import { CouplesWelcome } from "./CouplesWelcome";

/**
 * An app of For Couples with its own data (Recipes), before there is a group:
 * creating or joining one, in the app's frame with its name in the top bar and
 * no tabs yet, as Calendar and Tasks show it. Once in one, the page is loaded again, with
 * the app (its server render reads the group).
 */
export function GroupWelcomePage({
  appName,
  username,
  avatarUrl,
  theme,
}: {
  appName: string;
  username: string;
  avatarUrl: string | null;
  theme: Theme;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <OfflineSupport />
      <AppFrame theme={theme} username={username} avatarUrl={avatarUrl} inApp appName={appName}>
        <CouplesWelcome onJoined={() => startTransition(() => router.refresh())} busy={pending} />
      </AppFrame>
    </>
  );
}
