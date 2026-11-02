"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moveBefore, type Task, type TaskFields, type TaskList } from "@/lib/task-types";

export const undoSeconds = 5;

class TaskRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function taskRequest<T>(path = "", method = "GET", body?: object): Promise<T> {
  // keepalive: a change made just before leaving the page still gets there.
  const response = await fetch(`/api/shared/tasks${path}`, { method, cache: "no-store", keepalive: method !== "GET",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch(() => { throw new TaskRequestError("Could not reach the server. Check your connection.", 0); });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new TaskRequestError(result.error ?? "Could not reach your tasks. Try again.", response.status);
  return result.data;
}

// A random v4 UUID. crypto.randomUUID() would need a secure context, which the
// dev server opened from a phone over the LAN isn't.
function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const withoutTask = (lists: TaskList[], id: string) => lists.map((list) => ({ ...list, tasks: list.tasks.filter((t) => t.id !== id) }));
function updateTask(tasks: Task[], id: string, fields: TaskFields) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return tasks;
  const next = { ...task, ...fields };
  // Ticked off again: to the end of the list, as the API does.
  return task.isComplete && !next.isComplete ? [...tasks.filter((t) => t !== task), next] : tasks.map((t) => t === task ? next : t);
}

// A change shows at once, and is sent once every change before it is done.
// apply() must do nothing when what it changes is gone, and be safe to repeat.
type Change = { apply: (lists: TaskList[]) => TaskList[]; send: () => Promise<unknown> };

// The space's task lists with optimistic updates. What is shown is the last
// state the server confirmed with the pending changes applied on top; a change
// the server refuses is dropped, which rolls it back. Requests go one at a time
// in the order they were made, so the server applies them in that order too,
// and clients choose the ids of new lists and tasks, so later changes can refer
// to them before the server has answered.
export function useTasks() {
  const [confirmed, setConfirmed] = useState<TaskList[] | null>(null);
  const [pending, setPending] = useState<Change[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  // Deleted, but only sent once the undo window closes.
  const [deleting, setDeleting] = useState<Task | null>(null);
  const deletingRef = useRef<Task | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<void>>(null);

  const enqueue = useCallback((job: () => Promise<void>) => { queue.current = (queue.current ?? Promise.resolve()).then(job); }, []);
  const reload = useCallback(() => enqueue(async () => {
    try { setConfirmed(await taskRequest<TaskList[]>()); setLoadError(""); }
    catch (err) { setLoadError((err as Error).message); }
  }), [enqueue]);
  const change = useCallback((next: Change) => {
    setError("");
    setPending((current) => [...current, next]);
    enqueue(async () => {
      try {
        await next.send();
        setConfirmed((lists) => lists && next.apply(lists));
      } catch (err) {
        setError(`${(err as Error).message} Your change was undone.`);
        // Someone else changed or deleted it meanwhile: show what is there now.
        if (err instanceof TaskRequestError && [403, 404, 409].includes(err.status)) reload();
      } finally {
        setPending((current) => current.filter((c) => c !== next));
      }
    });
  }, [enqueue, reload]);

  const commitDelete = useCallback(() => {
    clearTimeout(undoTimer.current);
    const task = deletingRef.current;
    if (!task) return;
    deletingRef.current = null;
    setDeleting(null);
    change({ apply: (lists) => withoutTask(lists, task.id), send: () => taskRequest(`/${task.id}`, "DELETE") });
  }, [change]);
  const undoDelete = useCallback(() => {
    clearTimeout(undoTimer.current);
    deletingRef.current = null;
    setDeleting(null);
  }, []);
  // Paused while the pointer or focus is on the undo message.
  const pauseUndo = useCallback(() => clearTimeout(undoTimer.current), []);
  const resumeUndo = useCallback(() => {
    clearTimeout(undoTimer.current);
    if (deletingRef.current) undoTimer.current = setTimeout(commitDelete, undoSeconds * 1000);
  }, [commitDelete]);
  const deleteTask = useCallback((task: Task) => {
    commitDelete();
    deletingRef.current = task;
    setDeleting(task);
    resumeUndo();
  }, [commitDelete, resumeUndo]);

  // Leaving the Tasks view ends the undo window; so does leaving the page, where
  // the request has to start right away.
  useEffect(() => {
    function leave() {
      const task = deletingRef.current;
      if (!task) return;
      undoDelete();
      setConfirmed((lists) => lists && withoutTask(lists, task.id));
      void taskRequest(`/${task.id}`, "DELETE").catch(() => {});
    }
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); commitDelete(); };
  }, [commitDelete, undoDelete]);

  const lists = useMemo(() => {
    if (!confirmed) return null;
    const shown = pending.reduce((current, c) => c.apply(current), confirmed);
    return deleting ? withoutTask(shown, deleting.id) : shown;
  }, [confirmed, pending, deleting]);

  const actions = useMemo(() => ({
    /** Returns the new list's id. */
    createList(name: string) {
      const id = newId();
      change({
        apply: (lists) => lists.some((l) => l.id === id) ? lists : [...lists, { id, name, tasks: [] }],
        send: () => taskRequest("/lists", "POST", { id, name }),
      });
      return id;
    },
    renameList(id: string, name: string) {
      change({ apply: (lists) => lists.map((l) => l.id === id ? { ...l, name } : l), send: () => taskRequest(`/lists/${id}`, "PATCH", { name }) });
    },
    deleteList(id: string) {
      // The list takes its tasks with it, the one waiting for undo too.
      if (deletingRef.current?.listId === id) undoDelete();
      change({ apply: (lists) => lists.filter((l) => l.id !== id), send: () => taskRequest(`/lists/${id}`, "DELETE") });
    },
    moveList(id: string, beforeId: string | null) {
      change({ apply: (lists) => moveBefore(lists, id, beforeId) ?? lists, send: () => taskRequest(`/lists/${id}/move`, "POST", { beforeId }) });
    },
    addTask(listId: string, title: string) {
      const task: Task = { id: newId(), listId, title, notes: "", dueDate: null, assigneeId: null, isComplete: false };
      change({
        apply: (lists) => lists.map((l) => l.id === listId && !l.tasks.some((t) => t.id === task.id) ? { ...l, tasks: [...l.tasks, task] } : l),
        send: () => taskRequest(`/lists/${listId}/tasks`, "POST", { id: task.id, title }),
      });
    },
    updateTask(id: string, fields: TaskFields) {
      change({ apply: (lists) => lists.map((l) => ({ ...l, tasks: updateTask(l.tasks, id, fields) })), send: () => taskRequest(`/${id}`, "PATCH", fields) });
    },
    moveTask(listId: string, id: string, beforeId: string | null) {
      change({
        apply: (lists) => lists.map((l) => l.id === listId ? { ...l, tasks: moveBefore(l.tasks, id, beforeId) ?? l.tasks } : l),
        send: () => taskRequest(`/${id}/move`, "POST", { beforeId }),
      });
    },
    deleteTask, undoDelete, pauseUndo, resumeUndo,
  }), [change, deleteTask, undoDelete, pauseUndo, resumeUndo]);

  return {
    lists, loadError, error, deleting, reload, actions,
    saving: pending.length > 0,
    dismissError: () => setError(""),
  };
}
