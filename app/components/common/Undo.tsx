"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ui from "./ui.module.css";

export const undoSeconds = 5;

/** Something done, but only sent once its Undo has gone: a delete, leaving a space. */
export type Undoable = {
  /** What the message says: "Deleted “Groceries”". */
  label: string;
  /** Does it for real: when the Undo goes, another takes its place, or the page or view is left. */
  commit: () => void;
  /** Puts it back on screen, if it isn't simply shown again by dropping it. */
  onUndo?: () => void;
  /** Optional: the id of what it is about, e.g. a task's, so the view can hide it meanwhile. */
  id?: string;
};

/**
 * Undo instead of "are you sure?": `schedule` shows what was done, with Undo for
 * 5 seconds (paused while the pointer or focus is on the message), and only then
 * commits it. A new one commits the one before; leaving the view (unmounting)
 * or the page commits it at once, so nothing is lost.
 */
export function useUndo() {
  const [pending, setPending] = useState<Undoable | null>(null);
  const current = useRef<Undoable | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const commit = useCallback(() => {
    clearTimeout(timer.current);
    const done = current.current;
    current.current = null;
    setPending(null);
    done?.commit();
  }, []);
  const resume = useCallback(() => {
    clearTimeout(timer.current);
    if (current.current) timer.current = setTimeout(commit, undoSeconds * 1000);
  }, [commit]);
  const pause = useCallback(() => clearTimeout(timer.current), []);
  const schedule = useCallback(
    (next: Undoable) => {
      commit();
      current.current = next;
      setPending(next);
      resume();
    },
    [commit, resume],
  );
  const undo = useCallback(() => {
    clearTimeout(timer.current);
    const undone = current.current;
    current.current = null;
    setPending(null);
    undone?.onUndo?.();
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", commit);
    return () => {
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, [commit]);

  return useMemo(
    () => ({ pending, schedule, undo, pause, resume, commit }),
    [pending, schedule, undo, pause, resume, commit],
  );
}

/** The message with Undo, at the bottom of the screen (over the tab bar on a phone). */
export function UndoToast({ undo }: { undo: ReturnType<typeof useUndo> }) {
  if (!undo.pending) return null;
  return (
    <div
      className={ui.toast}
      role="status"
      onPointerEnter={undo.pause}
      onPointerLeave={undo.resume}
      onFocus={undo.pause}
      onBlur={undo.resume}
    >
      <span>{undo.pending.label}</span>
      <button type="button" className={ui.toastUndo} onClick={undo.undo}>
        Undo
      </button>
    </div>
  );
}
