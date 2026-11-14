/** How often a repeating task comes back (018_repeating_tasks.sql). */
export const repeats = ["daily", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof repeats)[number];
export const repeatNames: Record<Repeat, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

export type Task = {
  id: string;
  listId: string;
  title: string;
  notes: string;
  /** YYYY-MM-DD, a calendar date without a time zone. */
  dueDate: string | null;
  assigneeId: string | null;
  /** Optional for tasks cached by a previous release. */
  assigneeIds?: string[];
  isComplete: boolean;
  /** Ticked off, a repeating task comes back with its next due date (nextDue) instead of moving to Done. */
  repeat: Repeat | null;
};
/** Tasks in position order, done ones included (the view splits them off). */
export type TaskList = { id: string; name: string; tasks: Task[] };
export type TaskFields = Partial<
  Pick<Task, "title" | "notes" | "dueDate" | "assigneeId" | "assigneeIds" | "isComplete" | "repeat">
>;

export function taskAssignees(task: Pick<Task, "assigneeId" | "assigneeIds">): string[] {
  return task.assigneeIds ?? (task.assigneeId ? [task.assigneeId] : []);
}

function addPeriod(date: string, repeat: Repeat): string {
  const value = new Date(`${date}T12:00:00Z`);
  if (repeat === "daily") value.setUTCDate(value.getUTCDate() + 1);
  else if (repeat === "weekly") value.setUTCDate(value.getUTCDate() + 7);
  else {
    // The same day of the next month or year, or its last day when that one is shorter (31 Jan, 28 Feb).
    const day = value.getUTCDate();
    value.setUTCDate(1);
    if (repeat === "monthly") value.setUTCMonth(value.getUTCMonth() + 1);
    else value.setUTCFullYear(value.getUTCFullYear() + 1);
    const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
    value.setUTCDate(Math.min(day, last));
  }
  return value.toISOString().slice(0, 10);
}

/**
 * When a repeating task is due next, once it is ticked off on `today`: a period
 * after its due date (after today, without one), skipping the periods already
 * past, so bins due on Monday and done late on Tuesday are due next Monday.
 */
export function nextDue(repeat: Repeat, dueDate: string | null, today: string): string {
  let next = addPeriod(dueDate ?? today, repeat);
  while (next <= today) next = addPeriod(next, repeat);
  return next;
}

/**
 * A task with `fields` changed, on `today`: ticking off a repeating task moves its
 * due date on and leaves it to do. Used by the API and by the optimistic update.
 */
export function applyTaskFields(task: Task, fields: TaskFields, today: string): Task {
  const next = { ...task, ...fields };
  if (fields.assigneeIds !== undefined) {
    next.assigneeIds = [...new Set(fields.assigneeIds)];
    next.assigneeId = next.assigneeIds[0] ?? null;
  } else if (fields.assigneeId !== undefined) {
    next.assigneeIds = fields.assigneeId ? [fields.assigneeId] : [];
  }
  if (next.repeat && next.isComplete && !task.isComplete) {
    return { ...next, isComplete: false, dueDate: nextDue(next.repeat, next.dueDate, today) };
  }
  return next;
}

// Moves `id` to just before `beforeId`, or to the end when it is null. Used by
// the API and by the optimistic update, so both agree on the new order. Null
// when either item is missing (someone else changed the list meanwhile).
export function moveBefore<T extends { id: string }>(
  items: readonly T[],
  id: string,
  beforeId: string | null,
): T[] | null {
  const item = items.find((i) => i.id === id);
  const rest = items.filter((i) => i.id !== id);
  const index = beforeId === null ? rest.length : rest.findIndex((i) => i.id === beforeId);
  if (!item || index < 0) return null;
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}
