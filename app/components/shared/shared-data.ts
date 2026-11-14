"use client";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/api-request";
import type { CalendarEvent } from "@/lib/calendar";
import type { EventInput } from "@/lib/schemas";
import type { Space } from "@/lib/space-types";
import { applyTaskFields, moveBefore, type Task, type TaskFields, type TaskList } from "@/lib/task-types";

// Shared's data in the browser (components/common/QueryProvider): the queries
// of the space, its calendar and its tasks, and the changes made to them.

/** Calls /api/shared{path}. Changes send a JSON body, an empty one when there is nothing to say. */
export function sharedRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    signal,
    keepalive,
  }: { method?: string; body?: object; signal?: AbortSignal; keepalive?: boolean } = {},
): Promise<T> {
  return apiRequest<T>(`/api/shared${path}`, {
    method,
    signal,
    keepalive,
    body: method === "GET" || method === "DELETE" ? undefined : (body ?? {}),
    fallback: "Could not reach your space. Try again.",
  });
}

export const sharedKeys = {
  space: ["shared", "space"] as const,
  tasks: ["shared", "tasks"] as const,
  events: ["shared", "events"] as const,
  eventRange: (from: string, to: string) => ["shared", "events", from, to] as const,
  /** The agenda's: the first `count` events that end after `from`. */
  upcoming: ["shared", "events", "upcoming"] as const,
  upcomingFrom: (from: string, count: number) => ["shared", "events", "upcoming", from, count] as const,
  activity: ["shared", "activity"] as const,
  feed: ["shared", "calendar-feed"] as const,
};

export const spaceQuery = {
  queryKey: sharedKeys.space,
  queryFn: ({ signal }: { signal: AbortSignal }) => sharedRequest<Space | null>("/spaces", { signal }),
  meta: { persist: true },
};

// --- Tasks -------------------------------------------------------------------

// A change to the tasks, as plain data: it can wait in this browser for the
// connection (QueryProvider), and be sent after a reload. applyTaskChange shows
// it at once; sendTaskChange sends it.
export type TaskChange =
  | { kind: "createList"; id: string; name: string }
  | { kind: "renameList"; id: string; name: string }
  | { kind: "deleteList"; id: string }
  | { kind: "moveList"; id: string; beforeId: string | null }
  | { kind: "addTask"; task: Task }
  | { kind: "updateTask"; id: string; fields: TaskFields; today: string }
  | { kind: "moveTask"; listId: string; id: string; beforeId: string | null }
  | { kind: "deleteTask"; id: string };

const withoutTask = (lists: TaskList[], id: string) =>
  lists.map((list) => ({ ...list, tasks: list.tasks.filter((t) => t.id !== id) }));

function updateTasks(tasks: Task[], id: string, fields: TaskFields, today: string) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return tasks;
  const next = applyTaskFields(task, fields, today);
  // Ticked off again: to the end of the list, as the API does.
  return task.isComplete && !next.isComplete
    ? [...tasks.filter((t) => t !== task), next]
    : tasks.map((t) => (t === task ? next : t));
}

/**
 * The lists with a change made. Does nothing when what it changes is gone, and
 * is safe to repeat: it is applied on top of what the server last sent until the
 * server has it, and once more when it confirms it.
 */
export function applyTaskChange(lists: TaskList[], change: TaskChange): TaskList[] {
  switch (change.kind) {
    case "createList":
      return lists.some((l) => l.id === change.id)
        ? lists
        : [...lists, { id: change.id, name: change.name, tasks: [] }];
    case "renameList":
      return lists.map((l) => (l.id === change.id ? { ...l, name: change.name } : l));
    case "deleteList":
      return lists.filter((l) => l.id !== change.id);
    case "moveList":
      return moveBefore(lists, change.id, change.beforeId) ?? lists;
    case "addTask": {
      const { task } = change;
      return lists.map((l) =>
        l.id === task.listId && !l.tasks.some((t) => t.id === task.id) ? { ...l, tasks: [...l.tasks, task] } : l,
      );
    }
    case "updateTask":
      return lists.map((l) => ({ ...l, tasks: updateTasks(l.tasks, change.id, change.fields, change.today) }));
    case "moveTask":
      return lists.map((l) =>
        l.id === change.listId ? { ...l, tasks: moveBefore(l.tasks, change.id, change.beforeId) ?? l.tasks } : l,
      );
    case "deleteTask":
      return withoutTask(lists, change.id);
  }
}

// keepalive: a change made just before leaving the page still gets there.
function sendTaskChange(change: TaskChange): Promise<unknown> {
  const send = (path: string, method: string, body?: object) =>
    apiRequest(`/api/shared/tasks${path}`, {
      method,
      body,
      keepalive: true,
      fallback: "Could not reach your tasks. Try again.",
    });
  switch (change.kind) {
    case "createList":
      return send("/lists", "POST", { id: change.id, name: change.name });
    case "renameList":
      return send(`/lists/${change.id}`, "PATCH", { name: change.name });
    case "deleteList":
      return send(`/lists/${change.id}`, "DELETE");
    case "moveList":
      return send(`/lists/${change.id}/move`, "POST", { beforeId: change.beforeId });
    case "addTask":
      return send(`/lists/${change.task.listId}/tasks`, "POST", { id: change.task.id, title: change.task.title });
    case "updateTask":
      return send(`/${change.id}`, "PATCH", change.fields);
    case "moveTask":
      return send(`/${change.id}/move`, "POST", { beforeId: change.beforeId });
    case "deleteTask":
      return send(`/${change.id}`, "DELETE");
  }
}

export const taskMutationKey = ["shared", "task-change"] as const;

/**
 * Registers how task changes are sent (QueryProvider's setup), so the ones
 * kept from before a reload go out too: one at a time, in the order they were
 * made (a mutation scope), so the server applies them in that order. Once the
 * server has one, it is applied to what it last sent; one it refused is
 * dropped (which undoes it on screen), and when the reason is that someone
 * else changed the list meanwhile, the tasks load again.
 */
export function setupShared(client: QueryClient) {
  client.setMutationDefaults(taskMutationKey, {
    mutationFn: (change: TaskChange) => sendTaskChange(change),
    scope: { id: "shared-tasks" },
    onSuccess: async (_data, change) => {
      await client.cancelQueries({ queryKey: sharedKeys.tasks });
      client.setQueryData<TaskList[]>(sharedKeys.tasks, (lists) => lists && applyTaskChange(lists, change));
    },
    onError: (error) => {
      if (error instanceof ApiError && [403, 404, 409].includes(error.status))
        void client.invalidateQueries({ queryKey: sharedKeys.tasks });
    },
  });
}

// --- Calendar ----------------------------------------------------------------

export function eventRequest<T>(path = "", method = "GET", body?: EventInput, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/shared/events${path}`, {
    method,
    body,
    signal,
    fallback: "Could not reach your calendar. Try again.",
  });
}

/**
 * What a loaded list of events covers, from its key: a range of the month
 * (from..to), or the agenda's events from an instant on (sharedKeys.upcomingFrom).
 */
function eventsWindow(key: QueryKey): { from: string; to?: string } | null {
  if (key.length === 4) return { from: String(key[2]), to: String(key[3]) };
  if (key.length === 5 && key[2] === "upcoming") return { from: String(key[3]) };
  return null;
}

/**
 * Puts a saved event into every loaded list of the calendar it belongs in, in
 * order, and takes it out of the ones it left. The agenda's ask for one more
 * than they show, so one saved after the last shown goes past the end, out of sight.
 */
export function storeEvent(client: QueryClient, saved: CalendarEvent) {
  for (const [key, events] of client.getQueriesData<CalendarEvent[]>({ queryKey: sharedKeys.events })) {
    const window = eventsWindow(key);
    if (!events || !window) continue;
    const belongs = saved.endsAt > window.from && (window.to === undefined || saved.startsAt < window.to);
    const rest = events.filter((event) => event.id !== saved.id);
    client.setQueryData(
      key,
      belongs
        ? [...rest, saved].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
        : rest,
    );
  }
}

/** Takes a deleted event out of every loaded list. */
export function forgetEvent(client: QueryClient, id: string) {
  for (const [key, events] of client.getQueriesData<CalendarEvent[]>({ queryKey: sharedKeys.events })) {
    if (events && eventsWindow(key))
      client.setQueryData(
        key,
        events.filter((event) => event.id !== id),
      );
  }
}
