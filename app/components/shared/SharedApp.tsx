"use client";
import { useState } from "react";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, TasksIcon } from "@/components/common/icons";
import type { User } from "@/lib/users";
import type { Space } from "@/lib/space-types";
import { SpaceWelcome } from "./SpaceWelcome";
import { Calendar } from "./Calendar";
import { Tasks } from "./Tasks";

// Calendar and Tasks for the user's space, or before there is one, creating or
// joining one. The space's settings (its name, members, invites, leaving) are in
// Global Settings (/settings), from the account menu.
export function SharedApp({ user, initialSpace }: { user: User; initialSpace: Space | null }) {
  const [space, setSpace] = useState(initialSpace);
  return <AppShell key={space?.id ?? "welcome"} name="Shared" username={user.username} theme={user.themePreference}
    hideNavigation={!space} tabs={space ? [
      { id: "calendar", label: "Calendar", icon: <CalendarIcon />, view: <Calendar space={space} userId={user.id} /> },
      { id: "tasks", label: "Tasks", icon: <TasksIcon />, view: <Tasks space={space} /> },
    ] : [{ id: "welcome", label: "Your space", icon: <CalendarIcon />, view: <SpaceWelcome onJoined={setSpace} /> }]} />;
}
