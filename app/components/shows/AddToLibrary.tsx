"use client";
import { useEffect, useId, useRef, useState } from "react";
import { BookmarkIcon, CheckIcon, DoneIcon, PlayIcon, PlusIcon } from "@/components/common/icons";
import { addStatuses, statusNames, type LibraryItem, type LibraryStatus, type TitleSummary } from "@/lib/show-types";
import { useLibrary } from "./library";
import styles from "./Shows.module.css";

/** Each status's icon: Watching a play button, Planned a bookmark, Completed a tick. */
export const statusIcons: Record<LibraryStatus, () => React.ReactNode> = { watching: PlayIcon, planned: BookmarkIcon, completed: DoneIcon };

/** What each status means, in the guide's words. */
export const statusHints: Record<LibraryStatus, string> = {
  watching: "In the middle of it",
  planned: "Want to watch it",
  completed: "Seen it all",
};

export type TitleStatus = {
  /** The title in the library, if it is. */
  item: LibraryItem | undefined;
  /** Being added. */
  busy: boolean;
  /** Why the last add failed. */
  error: string;
  /** Adds the title with this status, or changes its status (or, with `toggle`, the same status again takes it out). */
  choose: (status: LibraryStatus) => void;
};

/** A title's place in the library, and adding it with a status from a card. */
export function useTitleStatus(title: TitleSummary, { toggle = false } = {}): TitleStatus {
  const library = useLibrary();
  const item = library.find(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(status: LibraryStatus) {
    setError("");
    if (item) {
      if (item.library.status !== status) library.change(item, { status });
      else if (toggle) library.remove(item);
      return;
    }
    setBusy(true);
    try { await library.add(title, status); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return { item, busy, error, choose };
}

/** The mark at a poster's bottom right: + to add, a tick once in the library, a ring while adding. Decorative. */
export function AddMark({ added, busy }: { added: boolean; busy: boolean }) {
  return <span className={styles.addMark} data-added={added} aria-hidden="true">
    {busy ? <span className={styles.addRing} /> : added ? <CheckIcon /> : <PlusIcon />}
  </span>;
}

/**
 * Over a card's poster: Watching, Planned or Completed, each with its icon (the
 * one the title has pressed). A choice closes it, and so do Escape, Cancel (for
 * screen readers) and a tap outside the card; focus goes back to `returnFocus`.
 */
export function StatusChooser({ title, status, onClose, returnFocus }: {
  title: TitleSummary; status: TitleStatus; onClose: () => void; returnFocus: () => HTMLElement | null;
}) {
  const group = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const current = status.item?.library.status;

  function close() {
    onClose();
    // Once the chooser is gone and what opened it is back.
    requestAnimationFrame(() => returnFocus()?.focus({ preventScroll: true }));
  }
  const latest = useRef({ close, onClose });
  useEffect(() => { latest.current = { close, onClose }; });

  // On opening: focus on the title's status, or the first; then listen for a
  // tap outside the card, and for Escape before a dialog around it (search)
  // takes it as closing itself.
  useEffect(() => {
    const box = group.current!;
    const card = box.closest("li") ?? box;
    (box.querySelector<HTMLElement>("[aria-pressed=true]") ?? box.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
    function onPointerDown(event: PointerEvent) {
      if (!card.contains(event.target as Node)) latest.current.onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.close();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return <div ref={group} className={styles.chooser} role="group" aria-labelledby={headingId}>
    <p id={headingId} className={styles.chooserHeading}>{current ? title.title : `Add ${title.title} as`}</p>
    {addStatuses.map((value, i) => {
      const Icon = statusIcons[value];
      return <button key={value} type="button" className={styles.chooserOption} data-status={value} aria-pressed={current === value}
        style={{ "--i": i } as React.CSSProperties} onClick={() => { status.choose(value); close(); }}>
        <Icon /><span>{statusNames[value]}</span>
      </button>;
    })}
    <button type="button" className={styles.srOnly} onClick={close}>Cancel</button>
  </div>;
}
