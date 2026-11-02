export type Task = {
  id: string; listId: string; title: string; notes: string;
  /** YYYY-MM-DD, a calendar date without a time zone. */
  dueDate: string | null;
  assigneeId: string | null; isComplete: boolean;
};
/** Tasks in position order, done ones included (the view splits them off). */
export type TaskList = { id: string; name: string; tasks: Task[] };
export type TaskFields = Partial<Pick<Task, "title" | "notes" | "dueDate" | "assigneeId" | "isComplete">>;

// Moves `id` to just before `beforeId`, or to the end when it is null. Used by
// the API and by the optimistic update, so both agree on the new order. Null
// when either item is missing (someone else changed the list meanwhile).
export function moveBefore<T extends { id: string }>(items: readonly T[], id: string, beforeId: string | null): T[] | null {
  const item = items.find((i) => i.id === id);
  const rest = items.filter((i) => i.id !== id);
  const index = beforeId === null ? rest.length : rest.findIndex((i) => i.id === beforeId);
  if (!item || index < 0) return null;
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}
