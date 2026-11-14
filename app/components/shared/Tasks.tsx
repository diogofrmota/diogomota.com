"use client";
import { useState, type FormEvent } from "react";
import { ChevronDownIcon, PlusIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { UndoToast } from "@/components/common/Undo";
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
function storedList() {
  try {
    return localStorage.getItem(listKey);
  } catch {
    return null;
  }
}

export function Tasks({ space }: { space: Space }) {
  // Loaded when Tasks is shown (Activity runs its effects again), every few
  // seconds while it is (what the others change shows up), and when the browser
  // tab comes back into view: useTasks.
  const { lists, loadError, error, undo, ticking, saving, offline, reload, actions, dismissError } = useTasks();
  const { panels, openPanel, closePanel } = useAppView();
  const [selectedId, setSelectedId] = useState(storedList);
  const [doneOpen, setDoneOpen] = useState(false);

  const list = lists?.find((l) => l.id === selectedId) ?? lists?.[0];
  // A task just ticked off stays here, ticked, until it moves to Done; it no
  // longer counts as one to do.
  const active = list?.tasks.filter((t) => !t.isComplete) ?? [];
  const toDo = active.filter((t) => !ticking.has(t.id)).length;
  const done = list?.tasks.filter((t) => t.isComplete) ?? [];
  const panel = panels.at(-1);
  const opened = panel?.startsWith("task:")
    ? lists?.flatMap((l) => l.tasks).find((t) => t.id === panel.slice(5))
    : undefined;
  const today = localParts(new Date()).date;
  function select(id: string) {
    setSelectedId(id);
    try {
      localStorage.setItem(listKey, id);
    } catch {}
  }
  function submitted(e: FormEvent<HTMLFormElement>, field: string) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(field) as HTMLInputElement;
    const value = input.value.trim();
    input.value = "";
    return value;
  }
  const rowProps = (task: Task) => ({
    task,
    space,
    today,
    ticking: ticking.has(task.id),
    onToggle: (isComplete: boolean) =>
      task.isComplete
        ? actions.updateTask(task.id, { isComplete })
        : isComplete
          ? actions.tickTask(task.id)
          : actions.untickTask(task.id),
    onOpen: () => openPanel(`task:${task.id}`),
    onDelete: () => actions.deleteTask(task),
  });

  // The view's title, then the lists to pick from, with Edit lists at their end.
  return (
    <section className={styles.tasks} aria-label="Shared tasks">
      <h1 className={styles.heading}>Tasks</h1>
      {error && <Alert onDismiss={dismissError}>{error}</Alert>}
      {loadError && <Alert onRetry={reload}>{loadError}</Alert>}
      {offline && (
        <p role="status" className={styles.offline}>
          You&rsquo;re offline. Your changes are kept here and go out once you&rsquo;re back online.
        </p>
      )}
      {!lists && !loadError && <Spinner label="Loading tasks…" />}
      {lists?.length === 0 && (
        <form
          className={styles.card}
          onSubmit={(e) => {
            const name = submitted(e, "name");
            if (name) select(actions.createList(name));
          }}
        >
          <h2>Start your first list</h2>
          <p className={ui.muted}>Groceries, chores, a trip: you can both add and tick off tasks.</p>
          <label>
            List name
            <input name="name" required maxLength={80} placeholder="e.g. Groceries" autoComplete="off" />
          </label>
          <Button variant="primary" type="submit">
            Create list
          </Button>
        </form>
      )}
      {lists && list && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.chips} role="group" aria-label="Task lists">
              {lists.map((l) => (
                <button key={l.id} type="button" aria-pressed={l.id === list.id} onClick={() => select(l.id)}>
                  {l.name}
                </button>
              ))}
              <button type="button" className={styles.newList} onClick={() => openPanel("lists:new")}>
                <PlusIcon />
                New list
              </button>
            </div>
            <button type="button" className={styles.editLists} onClick={() => openPanel("lists")}>
              Edit
            </button>
          </div>
          <section className={styles.list} aria-labelledby="task-list-name">
            {/* The list's name with how many tasks are left to do: "Groceries (3)". */}
            <div className={styles.listHeader}>
              <h2 id="task-list-name">
                {list.name} <span className={styles.count}>({toDo})</span>
              </h2>
              {saving && !offline && <span className={styles.saving}>Saving…</span>}
            </div>
            <form
              className={styles.add}
              onSubmit={(e) => {
                const title = submitted(e, "title");
                if (title) actions.addTask(list.id, title);
              }}
            >
              <input
                name="title"
                aria-label="Write a task"
                placeholder="Write a task"
                required
                maxLength={200}
                autoComplete="off"
              />
              <button type="submit">Add</button>
            </form>
            {active.length > 0 ? (
              <SortableList
                id="task-order"
                items={active.map((t) => ({ id: t.id, label: t.title }))}
                onMove={(id, beforeId) => actions.moveTask(list.id, id, beforeId)}
              >
                <ul className={styles.items} aria-label="To do">
                  {active.map((task) => (
                    <SortableTask key={task.id} {...rowProps(task)} />
                  ))}
                </ul>
              </SortableList>
            ) : (
              <p className={styles.empty}>
                {done.length ? "All done — nice work!" : "Nothing to do yet — add your first task!"}
              </p>
            )}

            {done.length > 0 && (
              <details className={styles.done} open={doneOpen} onToggle={(e) => setDoneOpen(e.currentTarget.open)}>
                <summary>
                  <ChevronDownIcon />
                  Done ({done.length})
                </summary>
                <ul className={styles.items} aria-label="Done">
                  {done.map((task) => (
                    <TaskRow key={task.id} {...rowProps(task)} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        </>
      )}
      <UndoToast undo={undo} />
      {lists && opened && (
        <TaskDialog
          key={opened.id}
          task={opened}
          list={lists.find((l) => l.id === opened.listId)!}
          space={space}
          onClose={closePanel}
          onSave={(fields) => actions.updateTask(opened.id, fields)}
          onDelete={() => {
            actions.deleteTask(opened);
            closePanel();
          }}
        />
      )}
      {lists && panel?.startsWith("lists") && (
        <ListsDialog
          lists={lists}
          focusNew={panel === "lists:new"}
          onClose={closePanel}
          onCreate={(name) => select(actions.createList(name))}
          onRename={actions.renameList}
          onDelete={actions.deleteList}
          onMove={actions.moveList}
        />
      )}
    </section>
  );
}
