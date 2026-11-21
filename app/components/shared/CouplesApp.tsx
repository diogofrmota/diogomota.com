"use client";
import { AppShell } from "@/components/common/AppShell";
import { CalendarIcon, TasksIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import type { AppViewState } from "@/lib/app-views";
import type { Space } from "@/lib/space-types";
import type { User } from "@/lib/users";
import { Calendar } from "./Calendar";
import { CouplesWelcome } from "./CouplesWelcome";
import { setupShared } from "./shared-data";
import { Tasks } from "./Tasks";
import { useGroup } from "./useGroup";

type AppProps = { user: User; initialSpace: Space | null; initial: AppViewState; version: string };

type CouplesAppProps = AppProps & {
  name: string;
  basePath: string;
  icon: React.ReactNode;
  /** The app's one view, for the user's group. */
  view: (space: Space) => React.ReactNode;
};

function Couples({ user, initialSpace, initial, name, basePath, icon, view }: Omit<CouplesAppProps, "version">) {
  const { space, onJoined } = useGroup(initialSpace);
  return (
    <AppShell
      key={space?.id ?? "welcome"}
      name={name}
      basePath={basePath}
      initial={space ? initial : { view: "welcome", panels: [] }}
      username={user.username}
      avatarUrl={user.avatarUrl}
      theme={user.themePreference}
      hideNavigation={!space}
      tabs={
        space
          ? [{ id: basePath.slice(1), label: name, icon, view: view(space) }]
          : [{ id: "welcome", label: "Your group", icon: null, view: <CouplesWelcome onJoined={onJoined} /> }]
      }
    />
  );
}

// An app of For Couples (docs/decisions/0023) with its one view, for the
// user's group, or before there is one, creating or joining one (no tabs). Its
// data is For Couples' (QueryProvider app "shared", for Calendar, Tasks and
// the group's settings alike, as when they were one app: what waits in this
// browser for the connection is sent from any of them). The open panel is in
// the URL (/tasks?p=task:...).
function CouplesApp({ version, ...props }: CouplesAppProps) {
  return (
    <QueryProvider app="shared" userId={props.user.id} version={version} setup={setupShared}>
      <Couples {...props} />
    </QueryProvider>
  );
}

/** Calendar (/calendar): the group's events, by month, week or as a list. */
export function CalendarApp(props: AppProps) {
  return (
    <CouplesApp
      {...props}
      name="Calendar"
      basePath="/calendar"
      icon={<CalendarIcon />}
      view={(space) => <Calendar space={space} userId={props.user.id} />}
    />
  );
}

/** Tasks (/tasks): the group's task lists. */
export function TasksApp(props: AppProps) {
  return (
    <CouplesApp
      {...props}
      name="Tasks"
      basePath="/tasks"
      icon={<TasksIcon />}
      view={(space) => <Tasks space={space} />}
    />
  );
}
