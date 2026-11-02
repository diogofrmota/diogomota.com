"use client";
import { useState } from "react";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, SettingsIcon, TasksIcon } from "@/components/common/icons";
import type { User } from "@/lib/users";
import type { Space } from "@/lib/space-types";
import { SpaceWelcome } from "./SpaceWelcome";
import { SpaceSettings } from "./SpaceSettings";
import { Calendar } from "./Calendar";
import { Tasks } from "./Tasks";

export function SharedApp({ user, initialSpace }: { user: User; initialSpace: Space | null }) {
  const [space, setSpace] = useState(initialSpace);
  return <AppShell key={space?.id ?? "welcome"} name="Shared" username={user.username} theme={user.themePreference}
    hideNavigation={!space} tabs={space ? [
      { id: "calendar", label: "Calendar", icon: <CalendarIcon />, view: <Calendar space={space} userId={user.id} /> },
      { id: "tasks", label: "Tasks", icon: <TasksIcon />, view: <Tasks space={space} /> },
      { id: "settings", label: "Settings", icon: <SettingsIcon />, view: <SpaceSettings space={space} userId={user.id} onChange={setSpace} /> },
    ] : [{ id: "welcome", label: "Your space", icon: <CalendarIcon />, view: <SpaceWelcome onJoined={setSpace} /> }]} />;
}
