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

/** The kinds that a run of is told as one line: "added 9 tasks to Home and Groceries". */
const groupable = new Set<ActivityItem["kind"]>([
  "event-added",
  "event-changed",
  "event-deleted",
  "list-added",
  "task-added",
  "task-done",
]);

/** Items further apart than this aren't one run, even one after another. */
const runSpan = 60 * 60_000;

/**
 * The feed's lines: an item, or a run of items of one kind by one person one
 * after another (within the hour), which reads as one line rather than nine.
 */
export function groupActivity(items: ActivityItem[]): ActivityItem[][] {
  const lines: ActivityItem[][] = [];
  for (const item of items) {
    const run = lines.at(-1);
    const last = run?.at(-1);
    if (
      run &&
      last &&
      groupable.has(item.kind) &&
      item.kind === last.kind &&
      item.person.id === last.person.id &&
      Date.parse(run[0].createdAt) - Date.parse(item.createdAt) <= runSpan
    ) {
      run.push(item);
    } else {
      lines.push([item]);
    }
  }
  return lines;
}
