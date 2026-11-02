"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { GripIcon, TrashIcon } from "@/components/common/icons";
import type { Space } from "@/lib/space-types";
import type { Task, TaskFields, TaskList } from "@/lib/task-types";
import { SortableList, useSortableItem } from "./Sortable";
import styles from "./Tasks.module.css";

// A modal dialog, a sheet from the bottom on phones. Escape closes it, and so
// does Back: it is shown for a useAppView panel. Focus starts on the element
// marked data-autofocus, if any (showModal ignores React's autoFocus).
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={heading} onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <div className={styles.dialogHeader}><h2 id={heading}>{title}</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

export function TaskDialog({ task, list, space, onClose, onSave, onDelete }: {
  task: Task; list: TaskList; space: Space; onClose: () => void; onSave: (fields: TaskFields) => void; onDelete: () => void;
}) {
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [assignee, setAssignee] = useState(task.assigneeId ?? "");
  const [error, setError] = useState("");
  const color = space.members.find((m) => m.id === assignee)?.color;
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title")).trim();
    if (!title) { setError("Enter a title."); return; }
    const next = { title, notes: String(form.get("notes")), dueDate: dueDate || null, assigneeId: assignee || null };
    const fields: TaskFields = Object.fromEntries(Object.entries(next).filter(([key, value]) => task[key as keyof typeof next] !== value));
    if (Object.keys(fields).length) onSave(fields);
    onClose();
  }
  return <Sheet title="Edit task" onClose={onClose}>
    <form className={styles.form} onSubmit={save}>
      <p className={styles.muted}>In {list.name}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <label>Title<input name="title" required maxLength={200} defaultValue={task.title} autoComplete="off" /></label>
      <div className={styles.fields}>
        <label>Due date (optional)
          <span className={styles.inputRow}><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            {dueDate && <button type="button" onClick={() => setDueDate("")}>Clear</button>}</span>
        </label>
        <label>Assignee
          <span className={styles.inputRow}><i className={styles.swatch} style={{ background: color ?? "transparent" }} aria-hidden="true" />
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {space.members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
            </select></span>
        </label>
      </div>
      <label>Notes (optional)<textarea name="notes" rows={4} maxLength={10000} defaultValue={task.notes} /></label>
      <div className={styles.actions}>
        <button className={styles.primary} type="submit">Save task</button>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className={styles.danger} onClick={onDelete}>Delete task</button>
      </div>
    </form>
  </Sheet>;
}

function ListRow({ list, confirming, onConfirm, onCancel, onRename, onDelete }: {
  list: TaskList; confirming: boolean; onConfirm: () => void; onCancel: () => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const { ref, style, isDragging, handle } = useSortableItem(list.id);
  const [name, setName] = useState(list.name);
  // Follow the saved name when it changes elsewhere (a rollback, another member).
  const [saved, setSaved] = useState(list.name);
  if (saved !== list.name) { setSaved(list.name); setName(list.name); }
  function rename() {
    const trimmed = name.trim();
    if (!trimmed) setName(list.name);
    else if (trimmed !== list.name) onRename(trimmed);
  }
  const count = list.tasks.length;
  return <li ref={ref} style={style} className={`${styles.listRow} ${isDragging ? styles.dragging : ""}`}>
    {confirming ? <div className={styles.confirm}>
      <p>Delete “{list.name}”{count ? ` and its ${count} ${count === 1 ? "task" : "tasks"}` : ""} for everyone in your space?</p>
      <div className={styles.actions}>
        <button type="button" className={styles.danger} onClick={onDelete}>Delete list</button>
        <button type="button" onClick={onCancel}>Keep list</button>
      </div>
    </div> : <>
      <button type="button" className={styles.handle} aria-label={`Reorder ${list.name}`} {...handle}><GripIcon /></button>
      <form onSubmit={(e) => { e.preventDefault(); rename(); }}>
        <input aria-label={`Name of list ${list.name}`} value={name} required maxLength={80} autoComplete="off"
          onChange={(e) => setName(e.target.value)} onBlur={rename} />
      </form>
      <button type="button" className={styles.iconButton} aria-label={`Delete ${list.name}`} onClick={onConfirm}><TrashIcon /></button>
    </>}
  </li>;
}

export function ListsDialog({ lists, focusNew, onClose, onCreate, onRename, onDelete, onMove }: {
  lists: TaskList[]; focusNew: boolean; onClose: () => void; onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void; onDelete: (id: string) => void; onMove: (id: string, beforeId: string | null) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("name") as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return;
    onCreate(name);
    input.value = "";
  }
  return <Sheet title="Lists" onClose={onClose}>
    <div ref={setRegion} className={styles.form}>
      {lists.length > 0 ? <SortableList id="task-list-order" items={lists.map((l) => ({ id: l.id, label: l.name }))} onMove={onMove} container={region}>
        <ul className={styles.listRows} aria-label="Your lists">{lists.map((list) => <ListRow key={list.id} list={list}
          confirming={confirming === list.id} onConfirm={() => setConfirming(list.id)} onCancel={() => setConfirming(null)}
          onRename={(name) => onRename(list.id, name)} onDelete={() => { setConfirming(null); onDelete(list.id); }} />)}</ul>
      </SortableList> : <p className={styles.muted}>No lists yet.</p>}
      <form className={styles.addList} onSubmit={create}>
        <label>New list<input name="name" required maxLength={80} placeholder="e.g. Groceries" autoComplete="off" data-autofocus={focusNew ? "" : undefined} /></label>
        <button type="submit">Add list</button>
      </form>
      <div className={styles.actions}><button type="button" className={styles.primary} onClick={onClose}>Done</button></div>
    </div>
  </Sheet>;
}
