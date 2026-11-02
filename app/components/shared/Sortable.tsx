"use client";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const instructions = "To reorder, press Space or Enter, move with the arrow keys, then press Space or Enter again to drop it, or Escape to cancel.";

// A vertical list whose items are dragged by their handle: with a mouse, a
// finger (the handle has touch-action: none, so the rest of the row still
// scrolls and swipes) or the keyboard. onMove gets the item that now follows
// the moved one, or null at the end.
export function SortableList({ id, items, onMove, container, children }: {
  id: string; items: { id: string; label: string }[]; onMove: (id: string, beforeId: string | null) => void;
  /** Where the screen reader announcements go; inside a modal dialog, it has to be in it. */
  container?: Element | null; children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((item) => item.id);
  // Whether the item has left its place yet: dnd-kit reports it over its own
  // place as soon as it is picked up, which needs no announcement.
  const moved = useRef(false);
  const label = (itemId: UniqueIdentifier) => items.find((item) => item.id === itemId)?.label ?? "Item";
  const position = (itemId: UniqueIdentifier) => `position ${ids.indexOf(String(itemId)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => { moved.current = false; return `Picked up ${label(active.id)}, ${position(active.id)}.`; },
    onDragOver: ({ active, over }) => {
      if (!over || (over.id === active.id && !moved.current)) return undefined;
      moved.current = true;
      return `${label(active.id)} moved to ${position(over.id)}.`;
    },
    onDragEnd: ({ active, over }) => over ? `${label(active.id)} dropped at ${position(over.id)}.` : `${label(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled.`,
  };
  function end({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const order = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    onMove(String(active.id), order[order.indexOf(String(active.id)) + 1] ?? null);
  }
  return <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={end}
    accessibility={{ announcements, container: container ?? undefined, screenReaderInstructions: { draggable: instructions } }}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
  </DndContext>;
}

/** For an item of a SortableList: its ref and style, and the props of its drag handle. */
export function useSortableItem(id: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return {
    ref: setNodeRef, isDragging,
    style: { transform: CSS.Translate.toString(transform), transition },
    handle: { ref: setActivatorNodeRef, ...attributes, ...listeners, "data-drag-handle": "" },
  };
}
