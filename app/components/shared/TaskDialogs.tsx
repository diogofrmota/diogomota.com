"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/common/Dialog";
import { ChevronDownIcon, CloseIcon, GripIcon, TrashIcon } from "@/components/common/icons";
import { Alert, Button } from "@/components/common/ui";
import { undoSeconds } from "@/components/common/Undo";
import ui from "@/components/common/ui.module.css";
import type { Space } from "@/lib/space-types";
import {
  taskAssignees,
  repeatNames,
  repeats,
  type Repeat,
  type Task,
  type TaskFields,
  type TaskList,
} from "@/lib/task-types";
import { datePlus, localParts } from "@/lib/calendar";
import { MaskedField } from "./MaskedField";
import { MemberPicker } from "./MemberPicker";
import { SortableList, useSortableItem } from "./Sortable";
import styles from "./Tasks.module.css";

// A modal dialog with a title and a close button, the whole screen on phones.
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const heading = useId();
  return (
    <Dialog className={styles.dialog} aria-labelledby={heading} onClose={onClose}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2 id={heading}>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </Dialog>
  );
}

/** The due dates a tap away in a task's popup: today, tomorrow and a week from today. */
const quickDates = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
] as const;

/**
 * A task's popup: its title, who it's for, when it's due (typed, or Today,
 * Tomorrow, Next week), how often it repeats, its notes and its list (another
 * one moves it there, to the end), then Save and Delete.
 */
export function TaskDialog({
  task,
  list,
  lists,
  space,
  onClose,
  onSave,
  onMove,
  onDelete,
}: {
  task: Task;
  list: TaskList;
  lists: readonly TaskList[];
  space: Space;
  onClose: () => void;
  onSave: (fields: TaskFields) => void;
  /** Moves the task to the end of another list. */
  onMove: (listId: string) => void;
  onDelete: () => void;
}) {
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const today = localParts(new Date()).date;
  const [assignees, setAssignees] = useState(() => taskAssignees(task));
  const [error, setError] = useState("");
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title")).trim();
    if (!title) {
      setError("Enter a title.");
      return;
    }
    const repeat = (repeats as readonly string[]).includes(String(form.get("repeat")))
      ? (form.get("repeat") as Repeat)
      : null;
    const next = {
      title,
      notes: String(form.get("notes")),
      dueDate: dueDate || null,
      assigneeIds: assignees,
      repeat,
    };
    const fields: TaskFields = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => task[key as keyof typeof next] !== value),
    );
    if (Object.keys(fields).length) onSave(fields);
    const listId = String(form.get("list") ?? list.id);
    if (listId !== list.id && lists.some((l) => l.id === listId)) onMove(listId);
    onClose();
  }
  return (
    <Sheet title="Edit task" onClose={onClose}>
      <form className={styles.form} onSubmit={save}>
        {lists.length < 2 && <p className={ui.muted}>In {list.name}</p>}
        {error && <Alert>{error}</Alert>}
        <label>
          Title
          <input name="title" required maxLength={200} defaultValue={task.title} autoComplete="off" />
        </label>
        <div className={styles.fields}>
          <MemberPicker
            multiple
            legend="Who?"
            name="assignee"
            members={space.members}
            values={assignees}
            onChangeMany={setAssignees}
          />
          <div className={styles.when}>
            {/* dd/mm/yyyy, typed (not the browser's date field, which can be mm/dd/yyyy). */}
            <label>
              Due date
              <span className={styles.inputRow}>
                <MaskedField
                  kind="date"
                  label="Due date"
                  value={dueDate}
                  onChange={setDueDate}
                  required={false}
                  className={styles.dueDate}
                />
                {dueDate && (
                  <button type="button" onClick={() => setDueDate("")}>
                    Clear
                  </button>
                )}
              </span>
            </label>
            <div className={styles.quickDates} role="group" aria-label="Due">
              {quickDates.map(({ label, days }) => {
                const value = datePlus(today, days);
                return (
                  <button key={label} type="button" aria-pressed={dueDate === value} onClick={() => setDueDate(value)}>
                    {label}
                  </button>
                );
              })}
            </div>
            {/* Ticked off, a repeating task comes back with its next due date (lib/task-types.ts, nextDue). */}
            <label>
              Repeat?
              <span className={styles.select}>
                <select name="repeat" defaultValue={task.repeat ?? ""}>
                  <option value="">Never</option>
                  {repeats.map((repeat) => (
                    <option key={repeat} value={repeat}>
                      {repeatNames[repeat]}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon />
              </span>
            </label>
          </div>
        </div>
        <label>
          Notes
          <textarea name="notes" rows={4} maxLength={10000} defaultValue={task.notes} />
        </label>
        {lists.length > 1 && (
          <label>
            List
            <span className={styles.select}>
              <select name="list" defaultValue={list.id}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon />
            </span>
          </label>
        )}
        {/* No Cancel: the × at the top closes it without saving. Delete offers Undo. */}
        <div className={ui.actions}>
          <Button variant="primary" type="submit">
            Save
          </Button>
          <Button variant="remove" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function ListRow({
  list,
  onRename,
  onDelete,
}: {
  list: TaskList;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { ref, style, isDragging, handle } = useSortableItem(list.id);
  const [name, setName] = useState(list.name);
  // Follow the saved name when it changes elsewhere (a rollback, another member).
  const [saved, setSaved] = useState(list.name);
  if (saved !== list.name) {
    setSaved(list.name);
    setName(list.name);
  }
  function rename() {
    const trimmed = name.trim();
    if (!trimmed) setName(list.name);
    else if (trimmed !== list.name) onRename(trimmed);
  }
  return (
    <li ref={ref} style={style} className={`${styles.listRow} ${isDragging ? styles.dragging : ""}`}>
      <button type="button" className={styles.handle} aria-label={`Reorder ${list.name}`} {...handle}>
        <GripIcon />
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rename();
        }}
      >
        <input
          aria-label={`Name of list ${list.name}`}
          value={name}
          required
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
        />
      </form>
      <button type="button" className={styles.iconButton} aria-label={`Delete ${list.name}`} onClick={onDelete}>
        <TrashIcon />
      </button>
    </li>
  );
}

/**
 * A list deleted in Edit lists: its row says so, with Undo, for 5 seconds; only
 * then is it deleted, with its tasks (closing the dialog deletes it at once).
 */
function DeletedRow({ list, onUndo }: { list: TaskList; onUndo: () => void }) {
  const count = list.tasks.length;
  return (
    <li className={`${styles.listRow} ${styles.deletedRow}`} role="status">
      <span>
        Deleted “{list.name}”{count ? ` and its ${count} ${count === 1 ? "task" : "tasks"}` : ""}
      </span>
      <Button onClick={onUndo}>Undo</Button>
    </li>
  );
}

export function ListsDialog({
  lists,
  focusNew,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onMove,
}: {
  lists: TaskList[];
  focusNew: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, beforeId: string | null) => void;
}) {
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  // The list waiting for its Undo to go, and when it goes.
  const [deleting, setDeleting] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deletingRef = useRef<string | null>(null);
  // The newest onDelete, for a delete that goes out after a later render.
  const latestDelete = useRef(onDelete);
  useEffect(() => {
    latestDelete.current = onDelete;
  });
  const commit = useRef(() => {
    clearTimeout(timer.current);
    const id = deletingRef.current;
    deletingRef.current = null;
    setDeleting(null);
    if (id) latestDelete.current(id);
  });
  useEffect(() => {
    const done = commit.current;
    return () => done();
  }, []);
  function remove(id: string) {
    commit.current();
    deletingRef.current = id;
    setDeleting(id);
    timer.current = setTimeout(commit.current, undoSeconds * 1000);
  }
  function undo() {
    clearTimeout(timer.current);
    deletingRef.current = null;
    setDeleting(null);
  }
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("name") as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return;
    onCreate(name);
    input.value = "";
  }
  return (
    <Sheet title="Lists" onClose={onClose}>
      <div ref={setRegion} className={styles.form}>
        {lists.length > 0 ? (
          <SortableList
            id="task-list-order"
            items={lists.filter((l) => l.id !== deleting).map((l) => ({ id: l.id, label: l.name }))}
            onMove={onMove}
            container={region}
          >
            <ul className={styles.listRows} aria-label="Your lists">
              {lists.map((list) =>
                list.id === deleting ? (
                  <DeletedRow key={list.id} list={list} onUndo={undo} />
                ) : (
                  <ListRow
                    key={list.id}
                    list={list}
                    onRename={(name) => onRename(list.id, name)}
                    onDelete={() => remove(list.id)}
                  />
                ),
              )}
            </ul>
          </SortableList>
        ) : (
          <p className={ui.muted}>No lists yet.</p>
        )}
        <form className={styles.addList} onSubmit={create}>
          <label>
            New list
            <input
              name="name"
              required
              maxLength={80}
              placeholder="e.g. Groceries"
              autoComplete="off"
              data-autofocus={focusNew ? "" : undefined}
            />
          </label>
          <button type="submit">Add list</button>
        </form>
        <div className={ui.actions}>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
