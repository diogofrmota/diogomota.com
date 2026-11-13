// The activity feeds (lib/activity.ts), for the server and the browser.

import type { Named } from "./names";
import type { TitleSummary } from "./show-types";

/** What happened (019_activity.sql, activity.kind), with what `data` holds for it. */
export type ActivityData = {
  // Shared, seen by the space's members.
  joined: Record<string, never>;
  left: Record<string, never>;
  "event-added": { title: string; startsAt: string; allDay: boolean };
  "event-changed": { title: string; startsAt: string; allDay: boolean };
  "event-deleted": { title: string };
  "list-added": { name: string };
  "task-added": { title: string; list: string };
  "task-done": { title: string; list: string };
  // Shows, seen by the user's friends.
  watching: Record<string, never>;
  planned: Record<string, never>;
  completed: Record<string, never>;
  favourite: Record<string, never>;
  recommended: { to: Named };
};
export type ActivityKind = keyof ActivityData;

export type ActivityItem = {
  [Kind in ActivityKind]: {
    id: string;
    kind: Kind;
    data: ActivityData[Kind];
    createdAt: string;
    /** Who did it. */
    person: Named & { id: string; avatarUrl: string | null };
    /** Shows: the title it is about. */
    title: TitleSummary | null;
  };
}[ActivityKind];
