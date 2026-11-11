"use client";
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { GripIcon, TrashIcon } from "@/components/common/icons";
import { dateLabel, datePlus } from "@/lib/calendar";
import type { Space } from "@/lib/space-types";
import type { Task } from "@/lib/task-types";
import { useSortableItem } from "./Sortable";
import styles from "./Tasks.module.css";

type RowProps = {
  task: Task; space: Space; /** YYYY-MM-DD in the calendar's time zone. */ today: string;
  onToggle: (isComplete: boolean) => void; onOpen: () => void; onDelete: () => void;
};

function dueText(date: string, today: string, isComplete: boolean) {
  if (date === today) return "Due today";
  if (date === datePlus(today, 1)) return "Due tomorrow";
  const label = dateLabel(date, { day: "numeric", month: "short", ...(date.slice(0, 4) !== today.slice(0, 4) && { year: "numeric" }) });
  return date < today && !isComplete ? `Overdue · ${label}` : `Due ${label}`;
}

// Swipe left with a finger (or pen) to delete; a mouse uses the delete button.
// The row has touch-action: pan-y, so vertical moves still scroll the page.
function useSwipe(onSwipe: () => void) {
  const [offset, setOffset] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; pointer: number; swiping: boolean } | null>(null);
  const swiped = useRef(false);
  function cancel() { start.current = null; setOffset(null); }
  return {
    offset,
    handlers: {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        swiped.current = false;
        if (e.pointerType === "mouse" || (e.target as Element).closest("[data-drag-handle]")) return;
        start.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId, swiping: false };
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const s = start.current;
        if (!s || e.pointerId !== s.pointer) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (!s.swiping) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          // A scroll, or a swipe to the right: not ours.
          if (Math.abs(dy) >= Math.abs(dx) || dx > 0) { start.current = null; return; }
          s.swiping = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        setOffset(Math.min(0, dx));
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        const s = start.current;
        if (!s?.swiping) { start.current = null; return; }
        swiped.current = true;
        if (s.x - e.clientX > Math.min(120, e.currentTarget.offsetWidth * 0.35)) { start.current = null; onSwipe(); }
        else cancel();
      },
      onPointerCancel: cancel,
      // A swipe that ends on a button isn't a tap on it.
      onClickCapture(e: MouseEvent) {
        if (swiped.current) { swiped.current = false; e.preventDefault(); e.stopPropagation(); }
      },
    },
  };
}

export function TaskRow({ task, space, today, onToggle, onOpen, onDelete, sortable }: RowProps & { sortable?: ReturnType<typeof useSortableItem> }) {
  const swipe = useSwipe(onDelete);
  const member = space.members.find((m) => m.id === task.assigneeId);
  const due = task.dueDate && dueText(task.dueDate, today, task.isComplete);
  return <li ref={sortable?.ref} style={sortable?.style}
    className={`${styles.task} ${sortable?.isDragging ? styles.dragging : ""} ${task.isComplete ? styles.complete : ""}`}>
    {swipe.offset !== null && <div className={styles.swipeBehind} aria-hidden="true"><TrashIcon />Delete</div>}
    <div className={`${styles.row} ${swipe.offset !== null ? styles.swiping : ""}`}
      style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined} {...swipe.handlers}>
      {sortable ? <button type="button" className={styles.handle} aria-label={`Reorder ${task.title}`} {...sortable.handle}><GripIcon /></button>
        : <span className={styles.handle} />}
      <label className={styles.check}>
        <input type="checkbox" checked={task.isComplete} aria-label={task.title} onChange={(e) => onToggle(e.target.checked)} />
      </label>
      <button type="button" className={styles.open} onClick={onOpen}>
        <span className={styles.title}>{task.title}</span>
        {(due || member) && <span className={styles.meta}>
          {due && <span className={due.startsWith("Overdue") ? styles.overdue : undefined}>{due}</span>}
          {member && <span className={styles.assignee} style={{ "--member-color": member.color } as CSSProperties}>
            <span className={styles.assigneeDot} aria-hidden="true" />{member.username}
          </span>}
        </span>}
        {task.notes && <span className={styles.notes}>{task.notes}</span>}
      </button>
      <button type="button" className={styles.rowDelete} aria-label={`Delete ${task.title}`} onClick={onDelete}><TrashIcon /></button>
    </div>
  </li>;
}

export function SortableTask(props: RowProps) {
  const sortable = useSortableItem(props.task.id);
  return <TaskRow {...props} sortable={sortable} />;
}
