"use client";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, AppFrame, type AppTab } from "@/components/common/AppShell";
import { ActivityFeed } from "@/components/common/ActivityFeed";
import { ClockIcon, UsersIcon, UserIcon } from "@/components/common/icons";
import { LoadError } from "../shows/TitleGrid";
import type { ActivityItem } from "@/lib/activity-types";
import type { Person } from "@/lib/social-types";
import type { AppViewState } from "@/lib/app-views";
import type { Theme } from "@/lib/themes";
import ui from "@/components/common/ui.module.css";
import { Friends } from "./Friends";
import { Profile, showHref } from "./Profile";
import { useSocialData } from "./social-data";
import styles from "./Social.module.css";

function Activity({ username }: { username: string }) {
  const router = useRouter();
  const { data, error, loading, retry } = useSocialData<ActivityItem[]>("/activity");
  return (
    <section className={styles.view} aria-labelledby="activity-heading">
      <h1 id="activity-heading" className={ui.heading}>
        Activity
      </h1>
      {error ? (
        <LoadError message={error.message} onRetry={retry} />
      ) : loading ? (
        <p role="status">Loading activity...</p>
      ) : (
        <ActivityFeed
          items={data ?? []}
          empty="Nothing yet. Add friends to keep up with their reading and watching."
          viewer={username}
          social
          limit={10}
          onOpenTitle={(title) => router.push(showHref(title))}
        />
      )}
    </section>
  );
}

// Social data lives only in memory, with no persisted queries or mutations.
export function SocialApp({
  user,
  theme,
  initial,
  profileId,
}: {
  user: Person;
  theme: Theme;
  initial: AppViewState;
  profileId?: string;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } }),
  );
  const router = useRouter();
  const tabs: AppTab[] = [
    { id: "activity", label: "Activity", icon: <ClockIcon />, view: <Activity username={user.username} /> },
    { id: "friends", label: "Friends", icon: <UsersIcon />, view: <Friends /> },
    { id: "profile", label: "My profile", icon: <UserIcon />, view: <Profile own /> },
  ];
  return (
    <QueryClientProvider client={client}>
      {profileId ? (
        <AppFrame
          theme={theme}
          username={user.username}
          avatarUrl={user.avatarUrl}
          nav={{
            label: "Social",
            tabs,
            current: "",
            onSelect: (id) => router.push(id === "activity" ? "/social" : `/social/${id}`),
          }}
        >
          <Profile personId={profileId} own={profileId === user.id} />
        </AppFrame>
      ) : (
        <AppShell
          name="Social"
          basePath="/social"
          initial={initial}
          username={user.username}
          avatarUrl={user.avatarUrl}
          theme={theme}
          tabs={tabs}
        />
      )}
    </QueryClientProvider>
  );
}
