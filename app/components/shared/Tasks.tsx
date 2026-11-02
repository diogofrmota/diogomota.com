"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/common/Spinner";
import { useAppView } from "@/hooks/useAppView";
import { localParts } from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import type { Task } from "@/lib/task-types";
import { SortableList } from "./Sortable";
import { ListsDialog, TaskDialog } from "./TaskDialogs";
import { SortableTask, TaskRow } from "./TaskItem";
import { useTasks } from "./useTasks";
import styles from "./Tasks.module.css";

// The list that was open last, on this device.
const listKey = "shared-tasks-list";
function storedList() { try { return localStorage.getItem(listKey); } catch { return null; } }

export function Tasks({ space }: { space: Space }) {
  const { lists, loadError, error, deleting, saving, reload, actions, dismissError } = useTasks();
  const { panels, openPanel, closePanel } = useAppView();
  const [selectedId, setSelectedId] = useState(storedList);
  const [doneOpen, setDoneOpen] = useState(false);
  // Activity runs effects again each time Tasks is shown, so this also picks up
  // what other members changed meanwhile; so does coming back to the tab.
  useEffect(() => { reload(); }, [space, reload]);
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [reload]);

  const list = lists?.find((l) => l.id === selectedId) ?? lists?.[0];
  const active = list?.tasks.filter((t) => !t.isComplete) ?? [];
  const done = list?.tasks.filter((t) => t.isComplete) ?? [];
  const panel = panels.at(-1);
  const opened = panel?.startsWith("task:") ? lists?.flatMap((l) => l.tasks).find((t) => t.id === panel.slice(5)) : undefined;
  const today = localParts(new Date()).date;
  function select(id: string) {
    setSelectedId(id);
    try { localStorage.setItem(listKey, id); } catch {}
  }
  function submitted(e: FormEvent<HTMLFormElement>, field: string) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(field) as HTMLInputElement;
    const value = input.value.trim();
    input.value = "";
    return value;
  }
  const rowProps = (task: Task) => ({
    task, space, today,
    onToggle: (isComplete: boolean) => actions.updateTask(task.id, { isComplete }),
    onOpen: () => openPanel(`task:${task.id}`),
    onDelete: () => actions.deleteTask(task),
  });

  return <section className={styles.tasks} aria-label="Shared tasks">
    <div className={styles.heading}>
      <div><p className={styles.muted}>{space.name}</p><h1>Tasks</h1></div>
      <div className={styles.headingActions}>
        {saving && <span className={styles.saving}>Saving…</span>}
        {!!lists?.length && <button type="button" onClick={() => openPanel("lists")}>Edit lists</button>}
      </div>
    </div>
    {error && <div role="alert" className={styles.alert}><p>{error}</p><button type="button" aria-label="Dismiss" onClick={dismissError}>×</button></div>}
    {loadError && <div role="alert" className={styles.alert}><p>{loadError}</p><button type="button" onClick={reload}>Retry</button></div>}
    {!lists && !loadError && <Spinner label="Loading tasks…" />}
    {lists?.length === 0 && <form className={styles.card} onSubmit={(e) => { const name = submitted(e, "name"); if (name) select(actions.createList(name)); }}>
      <h2>No lists yet — start your first one!</h2>
      <p className={styles.muted}>Groceries, chores, a trip: everyone in {space.name} can add and tick off tasks.</p>
      <label>List name<input name="name" required maxLength={80} placeholder="e.g. Groceries" autoComplete="off" /></label>
      <button type="submit" className={styles.primary}>Create list</button>
    </form>}
    {lists && list && <>
      <div className={styles.chips} role="group" aria-label="Task lists">
        {lists.map((l) => <button key={l.id} type="button" aria-pressed={l.id === list.id} onClick={() => select(l.id)}>{l.name}</button>)}
        <button type="button" className={styles.newList} onClick={() => openPanel("lists:new")}>+ New list</button>
      </div>
      <section className={styles.list} aria-labelledby="task-list-name">
        <div className={styles.listHeader}><h2 id="task-list-name">{list.name}</h2><span className={styles.muted}>{active.length} to do</span></div>
        {active.length > 0 ? <SortableList id="task-order" items={active.map((t) => ({ id: t.id, label: t.title }))}
          onMove={(id, beforeId) => actions.moveTask(list.id, id, beforeId)}>
          <ul className={styles.items} aria-label="To do">{active.map((task) => <SortableTask key={task.id} {...rowProps(task)} />)}</ul>
        </SortableList> : <p className={styles.empty}>{done.length ? "All done — nice work!" : "Nothing to do yet — add your first task!"}</p>}
        <form className={styles.add} onSubmit={(e) => { const title = submitted(e, "title"); if (title) actions.addTask(list.id, title); }}>
          <input name="title" aria-label="Add a task" placeholder="Add a task" required maxLength={200} autoComplete="off" />
          <button type="submit">Add</button>
        </form>
        {done.length > 0 && <details className={styles.done} open={doneOpen} onToggle={(e) => setDoneOpen(e.currentTarget.open)}>
          <summary>Done ({done.length})</summary>
          <ul className={styles.items} aria-label="Done">{done.map((task) => <TaskRow key={task.id} {...rowProps(task)} />)}</ul>
        </details>}
      </section>
    </>}
    {deleting && <div className={styles.toast} role="status" onPointerEnter={actions.pauseUndo} onPointerLeave={actions.resumeUndo}
      onFocus={actions.pauseUndo} onBlur={actions.resumeUndo}>
      <span>Deleted “{deleting.title}”</span><button type="button" onClick={actions.undoDelete}>Undo</button>
    </div>}
    {lists && opened && <TaskDialog key={opened.id} task={opened} list={lists.find((l) => l.id === opened.listId)!} space={space}
      onClose={closePanel} onSave={(fields) => actions.updateTask(opened.id, fields)}
      onDelete={() => { actions.deleteTask(opened); closePanel(); }} />}
    {lists && panel?.startsWith("lists") && <ListsDialog lists={lists} focusNew={panel === "lists:new"} onClose={closePanel}
      onCreate={(name) => select(actions.createList(name))} onRename={actions.renameList} onDelete={actions.deleteList} onMove={actions.moveList} />}
  </section>;
}
