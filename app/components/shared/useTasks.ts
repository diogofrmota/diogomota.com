"use client";
import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUndo } from "@/components/common/Undo";
import { localParts } from "@/lib/calendar";
import type { Task, TaskFields, TaskList } from "@/lib/task-types";
import { applyTaskChange, sharedKeys, sharedRequest, taskMutationKey, type TaskChange } from "./shared-data";

/**
 * How long a task just ticked off stays in its list, ticked and crossed out,
 * before it moves to Done (or, repeating, comes back with its next due date).
 * Its row leaves over the end of it (Tasks.module.css, .ticking: 350ms, then an
 * exit of 176ms, 20% shorter than an entrance): change both together.
 */
export const tickedMs = 530;
/** While Tasks is open, it asks the server this often for what the others changed. */
const liveMs = 5000;

// A random v4 UUID. crypto.randomUUID() would need a secure context, which the
// dev server opened from a phone over the LAN isn't.
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const today = () => localParts(new Date()).date;

// The space's task lists with optimistic updates (TanStack Query, set up in
// shared-data.ts). What is shown is the last state the server sent with the
// changes not yet confirmed applied on top, those waiting for the connection
// included; a change the server refuses is dropped, which rolls it back, with
// a message. Changes go one at a time in the order they were made, and clients
// choose the ids of new lists and tasks, so later changes can refer to them
// before the server has answered. While Tasks is shown, it loads again every
// few seconds (and whenever the browser tab is back in view), so what the
// others tick off in the shop shows up.
export function useTasks() {
  const client = useQueryClient();
  const busy = useIsMutating({ mutationKey: taskMutationKey }) > 0;
  const query = useQuery({
    queryKey: sharedKeys.tasks,
    queryFn: ({ signal }) => sharedRequest<TaskList[]>("/tasks", { signal }),
    meta: { persist: true },
    // Not while changes are going out: an answer from before them would show them undone for a moment.
    refetchInterval: busy ? false : liveMs,
  });
  const pending = useMutationState({
    filters: { mutationKey: taskMutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables as TaskChange,
  });
  // The newest refused change says why, until the next change or a dismiss.
  const refused = useMutationState({
    filters: { mutationKey: taskMutationKey, status: "error" },
    select: (mutation) => ({
      at: mutation.state.submittedAt,
      message: (mutation.state.error as Error | null)?.message,
    }),
  }).at(-1);
  const waiting = useMutationState({
    filters: { mutationKey: taskMutationKey, status: "pending" },
    select: (mutation) => mutation.state.isPaused,
  }).some(Boolean);
  const [dismissedAt, setDismissedAt] = useState(0);
  const error = refused && refused.at >= dismissedAt ? `${refused.message} Your change was undone.` : "";
  const { mutate } = useMutation<unknown, Error, TaskChange>({ mutationKey: taskMutationKey });
  const change = useCallback(
    (next: TaskChange) => {
      setDismissedAt(Date.now());
      mutate(next);
    },
    [mutate],
  );

  // Deleted, but only sent once the Undo has gone (components/common/Undo).
  const undo = useUndo();
  const deletingId = undo.pending?.id ?? null;

  // Ticked off, but only moved to Done (and sent) once tickedMs has passed, so
  // the tick is seen first: unticking one before then only cancels it.
  const [ticking, setTicking] = useState<ReadonlySet<string>>(() => new Set());
  const tickTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const untickTask = useCallback((id: string) => {
    clearTimeout(tickTimers.current.get(id));
    if (!tickTimers.current.delete(id)) return;
    setTicking((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);
  const completeTask = useCallback(
    (id: string) => change({ kind: "updateTask", id, fields: { isComplete: true }, today: today() }),
    [change],
  );
  const tickTask = useCallback(
    (id: string) => {
      if (tickTimers.current.has(id)) return;
      setTicking((current) => new Set(current).add(id));
      tickTimers.current.set(
        id,
        setTimeout(() => {
          untickTask(id);
          completeTask(id);
        }, tickedMs),
      );
    },
    [completeTask, untickTask],
  );
  // Leaving the Tasks view (or the page) moves the tasks just ticked off on at once.
  useEffect(() => {
    const timers = tickTimers.current;
    function leave() {
      for (const id of [...timers.keys()]) {
        untickTask(id);
        completeTask(id);
      }
    }
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [completeTask, untickTask]);

  const lists = useMemo(() => {
    if (!query.data) return null;
    const shown = pending.reduce(applyTaskChange, query.data);
    return deletingId ? shown.map((l) => ({ ...l, tasks: l.tasks.filter((t) => t.id !== deletingId) })) : shown;
  }, [query.data, pending, deletingId]);

  const actions = useMemo(
    () => ({
      /** Returns the new list's id. */
      createList(name: string) {
        const id = newId();
        change({ kind: "createList", id, name });
        return id;
      },
      renameList: (id: string, name: string) => change({ kind: "renameList", id, name }),
      deleteList(id: string) {
        // The list takes its tasks with it, the one waiting for Undo too.
        if (lists?.find((l) => l.id === id)?.tasks.some((t) => t.id === deletingId)) undo.undo();
        change({ kind: "deleteList", id });
      },
      moveList: (id: string, beforeId: string | null) => change({ kind: "moveList", id, beforeId }),
      addTask(listId: string, title: string) {
        const task: Task = {
          id: newId(),
          listId,
          title,
          notes: "",
          dueDate: null,
          assigneeId: null,
          isComplete: false,
          repeat: null,
        };
        change({ kind: "addTask", task });
      },
      updateTask: (id: string, fields: TaskFields) => change({ kind: "updateTask", id, fields, today: today() }),
      moveTask: (listId: string, id: string, beforeId: string | null) =>
        change({ kind: "moveTask", listId, id, beforeId }),
      moveTaskTo: (id: string, listId: string) => change({ kind: "moveTaskTo", id, listId }),
      /** Ticks a task off: it moves to Done (or comes back, repeating) once tickedMs has passed. */
      tickTask,
      /** Unticks a task ticked off within tickedMs, which leaves it where it was. */
      untickTask,
      deleteTask(task: Task) {
        // Deleted while ticked off: as it was, if the delete is undone.
        untickTask(task.id);
        undo.schedule({
          id: task.id,
          label: `Deleted “${task.title}”`,
          commit: () => change({ kind: "deleteTask", id: task.id }),
        });
      },
    }),
    [change, tickTask, untickTask, undo, lists, deletingId],
  );

  return {
    lists,
    // Also with lists kept from before (they may be out of date), which stay shown.
    loadError: query.error?.message ?? "",
    error,
    undo,
    reload: () => void client.invalidateQueries({ queryKey: sharedKeys.tasks }),
    actions,
    /** The tasks ticked off in the last tickedMs, still in the to-do list until then. */
    ticking,
    saving: pending.length > 0,
    /** Changes waiting for the connection, which go out once it is back. */
    offline: waiting,
    dismissError: () => setDismissedAt(Date.now()),
  };
}
