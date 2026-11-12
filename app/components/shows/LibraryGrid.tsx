"use client";
import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { HeartIcon, MoreIcon } from "@/components/common/icons";
import {
  formatEpisode, progressOf, statusNames, titleKey, type SharedEntry, type TitleLengths, type TitleSummary,
} from "@/lib/show-types";
import { ProgressLine, StatusBadge } from "./AddToLibrary";
import { useOpenActions } from "./QuickActions";
import { useOpenTitle } from "./shows-data";
import { Poster, SkeletonGrid, useGridColumns } from "./TitleGrid";
import styles from "./Shows.module.css";

const longPressMs = 500;
// A section shows whole rows of titles until "Show all": 3 rows when the grid
// has 4 columns or fewer (a phone), 2 when it's wider; 12 until it's measured.
const collapsedCount = (columns: number) => !columns ? 12 : columns * (columns <= 4 ? 3 : 2);

// Holding a finger (or pen) still on a card for half a second, or a right click,
// calls onLongPress instead of the browser's own menu; the click that may follow
// the long press is swallowed. Moving the finger (a scroll) cancels it.
function useLongPress(onLongPress: (x: number, y: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  function cancel() { clearTimeout(timer.current); start.current = null; }
  function fire(x: number, y: number) {
    cancel();
    fired.current = true;
    navigator.vibrate?.(10);
    onLongPress(x, y);
  }
  return {
    onPointerDown(e: PointerEvent) {
      fired.current = false;
      if (e.pointerType === "mouse") return;
      const { clientX: x, clientY: y } = e;
      start.current = { x, y };
      timer.current = setTimeout(() => fire(x, y), longPressMs);
    },
    onPointerMove(e: PointerEvent) {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // A right click, or a long press on Android, which shows a menu of its own.
    onContextMenu(e: MouseEvent) {
      e.preventDefault();
      if (!fired.current) fire(e.clientX, e.clientY);
    },
    onClickCapture(e: MouseEvent) {
      if (fired.current) { fired.current = false; e.preventDefault(); e.stopPropagation(); }
    },
  };
}

/** A title in the user's library, or in a friend's, with its seasons for the progress line. */
type CardItem = TitleSummary & Pick<TitleLengths, "episodesPerSeason"> & { library: SharedEntry };

/** "Watching, season 2 episode 5" and "S2 E5" for a TV show being watched. */
function libraryFacts(item: CardItem) {
  const { status } = item.library;
  const progress = item.type === "tv" && status === "watching" ? progressOf(item.library) : undefined;
  return {
    meta: progress !== undefined ? (progress ? formatEpisode(progress) : "Not started") : null,
    label: [item.title, item.year, statusNames[status],
      progress !== undefined && (progress ? `season ${progress.season} episode ${progress.episode}` : "not started"),
      item.library.isFavourite && "favourite"].filter(Boolean).join(", "),
  };
}

const cardSizes = "(min-width: 48rem) 160px, 34vw";

// A friend's titles are read-only: a card opens the detail panel, which is
// about the user's own library, and has no quick actions. As in TitleGrid, the
// button is the poster and the title, and covers the status badge and the facts.
// Watching and Completed are always on the poster; Planned only where the
// cards' statuses are mixed (`plannedBadge`), not in the Watchlist's Planned.
function LibraryCard({ item, readOnly, plannedBadge }: { item: CardItem; readOnly: boolean; plannedBadge: boolean }) {
  const openTitle = useOpenTitle();
  const openActions = useOpenActions();
  const longPress = useLongPress((x, y) => openActions(item, { left: x, right: x, top: y, bottom: y }));
  const facts = libraryFacts(item);
  const { status, isFavourite } = item.library;
  return <div className={styles.libraryCard}>
    <button type="button" className={styles.card} aria-label={facts.label} onClick={() => openTitle(item)} {...(readOnly ? {} : longPress)}>
      <span className={styles.posterFrame}>
        <Poster title={item} sizes={cardSizes} />
        <ProgressLine item={item} />
        {isFavourite && <span className={styles.favouriteMark} aria-hidden="true"><HeartIcon filled /></span>}
      </span>
      <span className={styles.cardTitle}>{item.title}</span>
    </button>
    {(status !== "planned" || plannedBadge) && <StatusBadge status={status} />}
    <span className={styles.cardMeta}>{[item.year, facts.meta].filter(Boolean).join(" · ")}</span>
    {!readOnly && <button type="button" className={styles.cardMenu} aria-label={`Quick actions for ${item.title}`} aria-haspopup="dialog"
      onClick={(e) => openActions(item, e.currentTarget.getBoundingClientRect())}>
      <MoreIcon />
    </button>}
  </div>;
}

export function LibraryGrid({ items, label, readOnly = false, plannedBadge = true, gridRef }: {
  items: readonly CardItem[]; label: string; readOnly?: boolean; plannedBadge?: boolean; gridRef?: (grid: HTMLElement | null) => void;
}) {
  return <ul ref={gridRef} className={styles.grid} aria-label={label}>
    {items.map((item) => <li key={titleKey(item)}><LibraryCard item={item} readOnly={readOnly} plannedBadge={plannedBadge} /></li>)}
  </ul>;
}

/** A section of library titles with its heading and count: whole rows of them until Show all. */
export function LibrarySection({ heading, label, loadingLabel, items, empty, readOnly, plannedBadge }: {
  heading: string;
  /** Names the grid, e.g. "Watching TV shows". */
  label: string;
  loadingLabel: string;
  /** null while loading. */
  items: readonly CardItem[] | null;
  empty: React.ReactNode;
  readOnly?: boolean;
  /** Whether Planned titles have a badge too (Watching and Completed always do): false where the heading says it. */
  plannedBadge?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const grid = useGridColumns();
  const count = collapsedCount(grid.columns);
  return <section className={styles.section} aria-labelledby={id} aria-busy={!items}>
    <div className={styles.sectionHeader}>
      <h2 id={id}>{heading}</h2>
      {!!items?.length && <span className={styles.count} aria-hidden="true">{items.length}</span>}
    </div>
    {!items ? <SkeletonGrid count={6} label={loadingLabel} />
      : !items.length ? <p className={styles.empty}>{empty}</p>
      : <>
        <LibraryGrid items={expanded ? items : items.slice(0, count)} label={label} readOnly={readOnly} plannedBadge={plannedBadge}
          gridRef={grid.ref} />
        {items.length > count && <button type="button" className={styles.more} aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${items.length}`}</button>}
      </>}
  </section>;
}
