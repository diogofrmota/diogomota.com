"use client";
import Image, { type ImageLoader } from "next/image";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { titleKey, tmdbImageUrl, type TitleSummary } from "@/lib/show-types";
import { AddMark, StatusChooser, useTitleStatus } from "./AddToLibrary";
import { useOpenActions } from "./QuickActions";
import styles from "./Shows.module.css";

// Posters come straight from TMDB's image server, which has them in fixed sizes:
// each width in next/image's srcset gets the closest one.
const tmdbLoader: ImageLoader = ({ src, width }) => tmdbImageUrl(src, width);

// Without a poster, the title in its place. Drawn by CSS (Shows.module.css,
// .noPoster) rather than as text: in a card it would be the button's visible text
// twice over, which its label (the title once, then the facts) doesn't match.
// Not draggable, so dragging a row (TitleRow) scrolls it instead.
export function Poster({ title, sizes, className = "" }: { title: TitleSummary; sizes: string; className?: string }) {
  if (!title.posterPath) return <span className={`${styles.poster} ${styles.noPoster} ${className}`} data-title={title.title} aria-hidden="true" />;
  return <Image loader={tmdbLoader} src={title.posterPath} alt="" width={342} height={513} sizes={sizes} draggable={false}
    className={`${styles.poster} ${className}`} />;
}

const typeName = (title: TitleSummary) => title.type === "tv" ? "TV show" : "Movie";

/** "2021 · ★ 7.8" (with the type first if `withType`), and the same for screen readers. */
export function titleFacts(title: TitleSummary, withType = false) {
  const facts = [withType && typeName(title), title.year].filter(Boolean);
  return {
    text: [...facts, title.rating === null ? "No rating" : `★ ${title.rating.toFixed(1)}`].join(" · "),
    label: [title.title, ...facts, title.rating === null ? "no rating yet" : `rated ${title.rating.toFixed(1)} out of 10`].join(", "),
  };
}

/** Card width, for a poster's `sizes`: about a third of a phone screen, 9rem or so on desktop. */
export const cardSizes = "(min-width: 48rem) 160px, 34vw";

// A card's button is its poster and title; the facts under them are outside it
// but covered by it, so a tap there opens the card too (Shows.module.css). Its
// label says the facts in words, and what a control shows has to be in its
// label, in order, for speech input (WCAG 2.5.3).
//
// At the poster's bottom right, + adds the title: it opens the status chooser
// over the poster (Watching, Planned, Completed). Once the title is in the
// library it is a tick, which opens its quick actions (status and rating).
// Cards fade in one after another (--i, their place in the list).
function TitleCard({ title, withType, onOpen, index }: {
  title: TitleSummary; withType: boolean; onOpen: (title: TitleSummary) => void; index: number;
}) {
  const facts = titleFacts(title, withType);
  const status = useTitleStatus(title);
  const openActions = useOpenActions();
  const [choosing, setChoosing] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const { item } = status;
  return <li className={styles.cardItem} style={{ "--i": index } as React.CSSProperties}>
    <button type="button" className={styles.card} aria-label={facts.label} onClick={() => { if (choosing) setChoosing(false); else onOpen(title); }}>
      <Poster title={title} sizes={cardSizes} />
      <span className={styles.cardTitle}>{title.title}</span>
    </button>
    {status.error ? <span role="alert" className={styles.cardError}>{status.error}</span>
      : <span className={styles.cardMeta}>{facts.text}</span>}
    <span className={styles.posterSpot}>
      {choosing ? <StatusChooser title={title} status={status} onClose={() => setChoosing(false)} returnFocus={() => addButton.current} />
        // Not disabled while adding: it keeps focus, which a choice hands back to it.
        : <button ref={addButton} type="button" className={styles.addButton} aria-busy={status.busy || undefined}
          aria-label={item ? `Quick actions for ${title.title}` : `Add ${title.title} to your library`}
          aria-haspopup={item ? "dialog" : undefined} aria-expanded={item ? undefined : false}
          onClick={(e) => { if (status.busy) return; if (item) openActions(item, e.currentTarget.getBoundingClientRect()); else setChoosing(true); }}>
          <AddMark added={!!item} busy={status.busy} />
        </button>}
    </span>
  </li>;
}

/** Cards in a grid, as many across as fit (search results). */
export function TitleGrid({ titles, label, withType = false, onOpen }: {
  titles: readonly TitleSummary[]; label: string; withType?: boolean; onOpen: (title: TitleSummary) => void;
}) {
  return <ul className={styles.grid} aria-label={label}>
    {titles.map((title, i) => <TitleCard key={titleKey(title)} title={title} withType={withType} onOpen={onOpen} index={i} />)}
  </ul>;
}

// With a mouse, dragging a row scrolls it, as a swipe does on a touch screen,
// and the click at the end of a drag doesn't open the card it ended on. Touch
// scrolls natively.
function useDragScroll() {
  const drag = useRef<{ x: number; left: number; pointer: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  function end(list: HTMLElement) {
    const moved = drag.current?.moved;
    drag.current = null;
    if (!moved) return;
    delete list.dataset.dragging;
    swallowClick.current = true;
    setTimeout(() => { swallowClick.current = false; });
  }
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, pointer: e.pointerId, moved: false };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current) return;
      const dx = e.clientX - current.x;
      if (!current.moved) {
        // A click that wobbles a little is still a click.
        if (Math.abs(dx) < 6) return;
        current.moved = true;
        e.currentTarget.setPointerCapture(current.pointer);
        e.currentTarget.dataset.dragging = "true";
      }
      e.currentTarget.scrollLeft = current.left - dx;
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e.currentTarget),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e.currentTarget),
    onClickCapture(e: MouseEvent) {
      if (swallowClick.current) { swallowClick.current = false; e.preventDefault(); e.stopPropagation(); }
    },
  };
}

/**
 * Cards in one row that scrolls sideways (Discover's sections): a swipe on a
 * touch screen, with the cards snapping into place; with a mouse, a drag, a
 * trackpad's sideways scroll, or the ‹ › buttons at its ends, which show while
 * the pointer is over the row and there is more that way. Edges with more to
 * see fade out. The keyboard goes from card to card, scrolling each into view.
 */
export function TitleRow({ titles, label, onOpen }: {
  titles: readonly TitleSummary[]; label: string; onOpen: (title: TitleSummary) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Whether it's scrolled to its start and to its end, as it scrolls and resizes.
  const [edges, setEdges] = useState({ start: true, end: true });
  const update = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdges((now) => (now.start === start && now.end === end ? now : { start, end }));
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(update);
    observer.observe(list.current!);
    return () => observer.disconnect();
  }, [update, titles]);
  const drag = useDragScroll();
  function scrollPage(direction: 1 | -1) {
    const el = list.current!;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: smooth ? "smooth" : "auto" });
  }
  // Out of the tab order: the cards are in it, and focusing one scrolls it into view.
  return <div className={styles.row} data-start={edges.start} data-end={edges.end}>
    <ul ref={list} className={styles.rowList} aria-label={label} onScroll={update} {...drag}>
      {titles.map((title, i) => <TitleCard key={titleKey(title)} title={title} withType={false} onOpen={onOpen} index={i} />)}
    </ul>
    <button type="button" className={`${styles.rowArrow} ${styles.rowBack}`} tabIndex={-1} aria-label="Scroll left"
      disabled={edges.start} onClick={() => scrollPage(-1)}><span aria-hidden="true">‹</span></button>
    <button type="button" className={`${styles.rowArrow} ${styles.rowForward}`} tabIndex={-1} aria-label="Scroll right"
      disabled={edges.end} onClick={() => scrollPage(1)}><span aria-hidden="true">›</span></button>
  </div>;
}

/**
 * How many columns a CSS grid has, following its size (0 until it's measured).
 * Give `ref` to the grid.
 */
export function useGridColumns() {
  const [grid, setGrid] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState(0);
  useEffect(() => {
    if (!grid) return;
    const measure = () => setColumns(getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid]);
  return { ref: setGrid, columns };
}

/** Grey cards in place of a grid (or a row) that is loading, with `label` for screen readers. */
export function SkeletonGrid({ count, label, row = false }: { count: number; label: string; row?: boolean }) {
  return <>
    <p role="status" className={styles.srOnly}>{label}</p>
    <ul className={row ? styles.rowList : styles.grid} aria-hidden="true" data-testid="skeleton">
      {Array.from({ length: count }, (_, i) => <li key={i}>
        <span className={`${styles.poster} ${styles.skeleton}`} />
        <span className={`${styles.skeletonLine} ${styles.skeleton}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonShort} ${styles.skeleton}`} />
      </li>)}
    </ul>
  </>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className={styles.error} role="alert">
    <p>{message}</p>
    <button type="button" onClick={onRetry}>Retry</button>
  </div>;
}
