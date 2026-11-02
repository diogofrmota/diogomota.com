"use client";
import { useState } from "react";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, SettingsIcon, TasksIcon } from "@/components/common/icons";
import { PlaceholderView } from "@/components/common/PlaceholderView";
import type { User } from "@/lib/users";
import type { Space } from "@/lib/space-types";
import { SpaceWelcome } from "./SpaceWelcome";
import { SpaceSettings } from "./SpaceSettings";
import styles from "./Spaces.module.css";

export function SharedApp({ user, initialSpace }: { user: User; initialSpace: Space | null }) {
  const [space, setSpace] = useState(initialSpace);
  return <AppShell key={space?.id ?? "welcome"} name="Shared" username={user.username} theme={user.themePreference}
    hideNavigation={!space} tabs={space ? [
      { id: "calendar", label: "Calendar", icon: <CalendarIcon />, view: <section className={styles.view}>
        <p className={styles.eyebrow}>{space.name}</p><h1>Calendar</h1>
        <div className={styles.card}><h2>Nothing planned yet</h2><p>Your shared calendar will live here.</p></div>
      </section> },
      { id: "tasks", label: "Tasks", icon: <TasksIcon />, view: <PlaceholderView title="Tasks" description="Shared task lists, with assignees, due dates and drag and drop." /> },
      { id: "settings", label: "Settings", icon: <SettingsIcon />, view: <SpaceSettings space={space} userId={user.id} onChange={setSpace} /> },
    ] : [{ id: "welcome", label: "Your space", icon: <CalendarIcon />, view: <SpaceWelcome onJoined={setSpace} /> }]} />;
}
