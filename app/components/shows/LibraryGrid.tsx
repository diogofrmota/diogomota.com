"use client";
import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { formatEpisode, progressOf, statusNames, titleKey, type SharedEntry, type TitleSummary } from "@/lib/show-types";
import { useOpenActions } from "./QuickActions";
import { useOpenTitle } from "./shows-data";
import { Poster, SkeletonGrid } from "./TitleGrid";
import styles from "./Shows.module.css";

const longPressMs = 500;
// A section shows this many titles until "Show all", like Discover.
const collapsedCount = 12;

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

/** A title in the user's library, or in a friend's. */
type CardItem = TitleSummary & { library: SharedEntry };

/** "Watching, season 2 episode 5" and "S2 E5", or the user's rating of a completed title. */
function libraryFacts(item: CardItem) {
  const { status, rating } = item.library;
  const progress = item.type === "tv" && status === "watching" ? progressOf(item.library) : undefined;
  const rated = status === "completed" && rating !== null;
  return {
    meta: progress !== undefined ? (progress ? formatEpisode(progress) : "Not started") : null,
    rated,
    label: [item.title, item.year, statusNames[status],
      progress !== undefined && (progress ? `season ${progress.season} episode ${progress.episode}` : "not started"),
      rated && `rated ${rating} out of 5`, item.library.isFavourite && "favourite"].filter(Boolean).join(", "),
  };
}

const cardSizes = "(min-width: 48rem) 160px, 34vw";

// A friend's titles are read-only: a card opens the detail panel, which is
// about the user's own library, and has no quick actions. As in TitleGrid, the
// button is the poster and the title, and covers the status badge and the facts.
function LibraryCard({ item, readOnly }: { item: CardItem; readOnly: boolean }) {
  const openTitle = useOpenTitle();
  const openActions = useOpenActions();
  const longPress = useLongPress((x, y) => openActions(item, { left: x, right: x, top: y, bottom: y }));
  const facts = libraryFacts(item);
  const { status, rating, isFavourite } = item.library;
  return <div className={styles.libraryCard}>
    <button type="button" className={styles.card} aria-label={facts.label} onClick={() => openTitle(item)} {...(readOnly ? {} : longPress)}>
      <span className={styles.posterFrame}>
        <Poster title={item} sizes={cardSizes} />
        {isFavourite && <span className={styles.favouriteMark} aria-hidden="true">♥</span>}
      </span>
      <span className={styles.cardTitle}>{item.title}</span>
    </button>
    <span className={`${styles.badge} ${styles[status]}`} aria-hidden="true">{statusNames[status]}</span>
    <span className={styles.cardMeta}>
      {[item.year, facts.meta].filter(Boolean).join(" · ")}
      {facts.rated && <span className={styles.cardStars}>{item.year ? " · " : ""}
        <span className={styles.starOn}>{"★".repeat(rating!)}</span><span className={styles.starOff}>{"★".repeat(5 - rating!)}</span>
      </span>}
    </span>
    {!readOnly && <button type="button" className={styles.cardMenu} aria-label={`Quick actions for ${item.title}`} aria-haspopup="dialog"
      onClick={(e) => openActions(item, e.currentTarget.getBoundingClientRect())}>
      <span aria-hidden="true">⋯</span>
    </button>}
  </div>;
}

export function LibraryGrid({ items, label, readOnly = false }: { items: readonly CardItem[]; label: string; readOnly?: boolean }) {
  return <ul className={styles.grid} aria-label={label}>
    {items.map((item) => <li key={titleKey(item)}><LibraryCard item={item} readOnly={readOnly} /></li>)}
  </ul>;
}

/** A section of library titles with its heading and count: the first 12 until Show all. */
export function LibrarySection({ heading, label, loadingLabel, items, empty, readOnly }: {
  heading: string;
  /** Names the grid, e.g. "Watching TV shows". */
  label: string;
  loadingLabel: string;
  /** null while loading. */
  items: readonly CardItem[] | null;
  empty: React.ReactNode;
  readOnly?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return <section className={styles.section} aria-labelledby={id} aria-busy={!items}>
    <div className={styles.sectionHeader}>
      <h2 id={id}>{heading}</h2>
      {!!items?.length && <span className={styles.count} aria-hidden="true">{items.length}</span>}
    </div>
    {!items ? <SkeletonGrid count={6} label={loadingLabel} />
      : !items.length ? <p className={styles.empty}>{empty}</p>
      : <>
        <LibraryGrid items={expanded ? items : items.slice(0, collapsedCount)} label={label} readOnly={readOnly} />
        {items.length > collapsedCount && <button type="button" className={styles.more} aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${items.length}`}</button>}
      </>}
  </section>;
}
