import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, SettingsIcon, TasksIcon } from "@/components/common/icons";
import { PlaceholderView } from "@/components/common/PlaceholderView";
import { appViewport } from "@/lib/apps";
import { findUserById } from "@/lib/users";

// The Shared app. proxy.ts keeps logged-out users out. The views are placeholders
// until they are built.
export const metadata: Metadata = { title: "Shared", robots: { index: false } };

export const viewport = appViewport;

export default async function SharedPage() {
  const { id } = await requireUser("/shared");
  const user = await findUserById(id);
  if (!user) notFound();

  return (
    <AppShell
      name="Shared"
      username={user.username}
      theme={user.themePreference}
      tabs={[
        {
          id: "calendar",
          label: "Calendar",
          icon: <CalendarIcon />,
          view: (
            <PlaceholderView
              title="Calendar"
              description="Your space's calendar, by month, week or day, with events for one person or the whole group."
            />
          ),
        },
        {
          id: "tasks",
          label: "Tasks",
          icon: <TasksIcon />,
          view: (
            <PlaceholderView
              title="Tasks"
              description="Shared task lists, with assignees, due dates and drag and drop."
            />
          ),
        },
        {
          id: "settings",
          label: "Settings",
          icon: <SettingsIcon />,
          view: (
            <PlaceholderView
              title="Settings"
              description="Your space's name, its members and invites, and leaving it."
            />
          ),
        },
      ]}
    />
  );
}
