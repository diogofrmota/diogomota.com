"use client";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppFrame, type AppTab } from "@/components/common/AppShell";
import type { Theme } from "@/lib/themes";
import { Profile } from "./Profile";
import type { SocialApp } from "./social-data";

/**
 * A friend's profile (/shows/profile/id, /books/profile/id): the app's frame
 * and tabs around it, each tab a link back into the app, with none of the
 * app's own data loaded. ‹ Back in the top bar goes back to where it was
 * opened from (the Friends list, a title, the activity), or to your own
 * profile when the page was loaded here (the web app on a phone has no
 * browser Back). Profiles live only in memory, never kept offline.
 */
export function FriendProfile({
  app,
  name,
  tabs,
  user,
  theme,
  profileId,
}: {
  app: SocialApp;
  /** The app's name, which names its tab bar. */
  name: string;
  /** The app's tabs, without their views: the first is the app's own path. */
  tabs: Omit<AppTab, "view">[];
  user: { id: string; username: string; avatarUrl: string | null };
  theme: Theme;
  profileId: string;
}) {
  const router = useRouter();
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } }),
  );
  const own = profileId === user.id;
  return (
    <QueryClientProvider client={client}>
      <AppFrame
        theme={theme}
        username={user.username}
        avatarUrl={user.avatarUrl}
        back={{ label: "Back", href: `/${app}/profile`, history: true }}
        nav={{
          label: name,
          tabs: tabs.map((tab) => ({ ...tab, view: null })),
          current: own ? "profile" : "",
          onSelect: (id) => router.push(id === tabs[0].id ? `/${app}` : `/${app}/${id}`),
        }}
      >
        <Profile app={app} personId={profileId} own={own} username={user.username} />
      </AppFrame>
    </QueryClientProvider>
  );
}
