"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, SettingsIcon, TasksIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import type { AppViewState } from "@/lib/app-views";
import type { User } from "@/lib/users";
import type { Space } from "@/lib/space-types";
import { Calendar } from "./Calendar";
import { setupShared, spaceQuery } from "./shared-data";
import { SpaceSettings } from "./SpaceSettings";
import { SpaceWelcome } from "./SpaceWelcome";
import { Tasks } from "./Tasks";

function Shared({ user, initialSpace, initial }: { user: User; initialSpace: Space | null; initial: AppViewState }) {
  const [space, setSpace] = useState(initialSpace);
  // Set once a space is created or joined here, which the check below must not undo.
  const joined = useRef(false);
  // The space as the server has it now. The one shown is kept if nothing
  // changed, so the views don't load again for nothing.
  const showSpace = useCallback((current: Space | null) => {
    setSpace((shown) => (JSON.stringify(shown) === JSON.stringify(current) ? shown : current));
  }, []);
  // The page may be one the browser kept for Back, rendered before the space
  // changed (left, or members came or went): checked once shown (and kept in
  // this browser for offline use), and replaced if it did. A failed check keeps
  // what's shown; the views say so themselves if the space can't be reached.
  const checked = useQuery({ ...spaceQuery, initialData: initialSpace, initialDataUpdatedAt: 0 });
  // Once the check is done: isFetchedAfterMount alone is also set by restoring the space kept in this browser.
  useEffect(() => {
    if (!joined.current && checked.isFetchedAfterMount && !checked.isFetching) showSpace(checked.data ?? null);
  }, [checked.data, checked.isFetchedAfterMount, checked.isFetching, showSpace]);
  const client = useQueryClient();
  function onJoined(next: Space) {
    joined.current = true;
    // What the views read is the space now, not the answer from before it.
    client.setQueryData(spaceQuery.queryKey, next);
    setSpace(next);
  }
  return (
    <AppShell
      key={space?.id ?? "welcome"}
      name="Shared"
      basePath="/shared"
      initial={space ? initial : { view: "welcome", panels: [] }}
      username={user.username}
      avatarUrl={user.avatarUrl}
      theme={user.themePreference}
      hideNavigation={!space}
      tabs={
        space
          ? [
              {
                id: "calendar",
                label: "Calendar",
                icon: <CalendarIcon />,
                view: <Calendar space={space} userId={user.id} />,
              },
              { id: "tasks", label: "Tasks", icon: <TasksIcon />, view: <Tasks space={space} userId={user.id} /> },
              {
                id: "settings",
                label: "Settings",
                icon: <SettingsIcon />,
                view: <SpaceSettings space={space} userId={user.id} onChange={showSpace} />,
              },
            ]
          : [{ id: "welcome", label: "Your space", icon: null, view: <SpaceWelcome onJoined={onJoined} /> }]
      }
    />
  );
}

// Calendar, Tasks and Settings (the space's members, invites, leaving) for the
// user's space, as tabs (in the middle of the top bar, or along the bottom of a
// phone's screen), or before there is one, creating or joining one (no tabs).
// The view and its open panel are in the URL (/shared/tasks?p=task:...).
export function SharedApp({
  user,
  initialSpace,
  initial,
  version,
}: {
  user: User;
  initialSpace: Space | null;
  initial: AppViewState;
  version: string;
}) {
  return (
    <QueryProvider userId={user.id} version={version} setup={setupShared}>
      <Shared user={user} initialSpace={initialSpace} initial={initial} />
    </QueryProvider>
  );
}
