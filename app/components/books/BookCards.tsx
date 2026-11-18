"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MoreIcon } from "@/components/common/icons";
import { flyTo, successPulse } from "@/components/common/motion";
import ui from "@/components/common/ui.module.css";
import { AddMark } from "@/components/shows/AddToLibrary";
import { useLongPress } from "@/components/shows/LibraryGrid";
import type { Anchor } from "@/components/shows/QuickActions";
import shows from "@/components/shows/Shows.module.css";
import { useDragScroll } from "@/components/shows/TitleGrid";
import { useAppView } from "@/hooks/useAppView";
import {
  pagesText,
  shelfLabels,
  shelfShortLabels,
  shelves,
  type Book,
  type CatalogBook,
  type Shelf,
} from "@/lib/book-types";
import { catalogInput, useOpenBook, useShelves } from "./books-data";
import { Cover, ReadLine, ShelfBadge, shelfIcons, shelfStatus } from "./BookParts";
import styles from "./Books.module.css";

// The cards of Books, as Shows' (TitleGrid, LibraryGrid): a cover and the
// title, the author under them; a card's button covers all of it.

// Where each quick actions menu was opened from: the ⋯ button, or the point of
// a right click or long press (as Shows' QuickActions).
const anchors = new Map<string, Anchor>();
export const actionsAnchor = (bookId: string) => anchors.get(bookId);

/** Opens a book's quick actions (panel "actions:<id>") next to `anchor`. */
export function useOpenBookActions() {
  const { openPanel } = useAppView();
  return (book: Book, anchor: Anchor) => {
    anchors.set(book.id, anchor);
    openPanel(`actions:${book.id}`);
  };
}

/** A book on one of the shelves, in Library: its panel on a tap, its quick actions on ⋯, a long press or a right click. */
export function BookCard({ book }: { book: Book }) {
  const openBook = useOpenBook();
  const openActions = useOpenBookActions();
  const longPress = useLongPress((x, y) => openActions(book, { left: x, right: x, top: y, bottom: y }));
  const reading = book.shelf === "currently-reading";
  const author = book.author || "Unknown author";
  const label = [book.title, author, shelfLabels[book.shelf], reading && pagesText(book)].filter(Boolean).join(", ");
  return (
    <div className={shows.libraryCard}>
      <button type="button" className={shows.card} aria-label={label} onClick={() => openBook(book)} {...longPress}>
        <span className={shows.posterFrame}>
          <Cover book={book} />
          <ReadLine book={book} />
        </span>
        <span className={shows.cardTitle}>{book.title}</span>
      </button>
      <span className={shows.cardMeta}>{author}</span>
      {reading && <span className={shows.cardMeta}>{pagesText(book)}</span>}
      <button
        type="button"
        className={shows.cardMenu}
        aria-label={`Quick actions for ${book.title}`}
        aria-haspopup="dialog"
        onClick={(e) => openActions(book, e.currentTarget.getBoundingClientRect())}
      >
        <MoreIcon />
      </button>
    </div>
  );
}

/**
 * A book just added from its card: its mark says so with a pulse, and (where
 * the tab bar is in view, not from inside a panel) its cover flies into the
 * Library tab, where it now is.
 */
function celebrateAdding(card: Element | null) {
  if (!card) return;
  successPulse(card.querySelector(`.${shows.addMark}`));
  const cover = card.querySelector("img");
  const library = document.querySelector('nav [data-tab="library"]');
  if (cover && library && !card.closest("dialog")) flyTo(cover, library);
}

/**
 * Over a catalogue card's cover: Want to Read, Reading or Finished, each with
 * its icon (the book's shelf pressed). A choice closes it; so do Escape, Cancel
 * (for screen readers) and a tap outside the card, with focus back on `returnFocus`.
 */
function ShelfChooser({
  title,
  current,
  onChoose,
  onClose,
  returnFocus,
}: {
  title: string;
  current: Shelf | undefined;
  onChoose: (shelf: Shelf, card: Element | null) => void;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
}) {
  const group = useRef<HTMLDivElement>(null);
  const headingId = useId();
  function close() {
    onClose();
    requestAnimationFrame(() => returnFocus()?.focus({ preventScroll: true }));
  }
  const latest = useRef({ close, onClose });
  useEffect(() => {
    latest.current = { close, onClose };
  });
  // On opening: focus on the book's shelf, or the first; then a tap outside the
  // card closes it, and so does Escape, before a panel around it (search) takes it.
  useEffect(() => {
    const box = group.current!;
    const card = box.closest("li") ?? box;
    (box.querySelector<HTMLElement>("[aria-pressed=true]") ?? box.querySelector<HTMLElement>("button"))?.focus({
      preventScroll: true,
    });
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
  return (
    <div ref={group} className={`${shows.chooser} ${styles.shelfChooser}`} role="group" aria-labelledby={headingId}>
      <p id={headingId} className={shows.chooserHeading}>
        {current ? title : `Add ${title} as`}
      </p>
      {shelves.map((shelf, i) => {
        const Icon = shelfIcons[shelf];
        return (
          <button
            key={shelf}
            type="button"
            className={`${shows.chooserOption} ${styles.shelfOption}`}
            data-status={shelfStatus[shelf]}
            aria-pressed={current === shelf}
            style={{ "--i": i } as React.CSSProperties}
            onClick={() => {
              onChoose(shelf, group.current?.closest("li") ?? null);
              close();
            }}
          >
            <Icon />
            <span>{shelfShortLabels[shelf]}</span>
          </button>
        );
      })}
      {/* For keyboards and screen readers only: it closes with Escape or a tap elsewhere too. */}
      <span className={ui.srOnly}>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </span>
    </div>
  );
}

/**
 * A book from the catalogue (Discover, search): its panel on a tap. At the
 * cover's bottom right, + puts it on a shelf (the chooser over the cover);
 * once it's on one, a tick, which opens its quick actions, and Reading or
 * Finished at the top left. Cards fade in one after another (--i).
 */
export function CatalogCard({ book, index }: { book: CatalogBook; index: number }) {
  const shelvesData = useShelves();
  const openBook = useOpenBook();
  const openActions = useOpenBookActions();
  const onShelf = shelvesData.byCatalogId(book.catalogId);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  async function choose(shelf: Shelf, card: Element | null) {
    setError("");
    if (onShelf) {
      if (onShelf.shelf !== shelf) shelvesData.change(onShelf, { shelf });
      return;
    }
    setBusy(true);
    try {
      await shelvesData.add(catalogInput(book, shelf));
      celebrateAdding(card);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const author = book.author || "Unknown author";
  const label = [book.title, author, onShelf && shelfLabels[onShelf.shelf]].filter(Boolean).join(", ");
  return (
    <li className={shows.cardItem} style={{ "--i": index } as React.CSSProperties}>
      <button
        type="button"
        className={shows.card}
        aria-label={label}
        onClick={() => {
          if (choosing) setChoosing(false);
          else openBook(book);
        }}
      >
        <Cover book={book} />
        <span className={shows.cardTitle}>{book.title}</span>
      </button>
      {error ? (
        <span role="alert" className={shows.cardError}>
          {error}
        </span>
      ) : (
        <span className={shows.cardMeta}>{author}</span>
      )}
      <span className={shows.posterSpot}>
        {onShelf && !choosing && <ReadLine book={onShelf} />}
        {onShelf && onShelf.shelf !== "want-to-read" && !choosing && <ShelfBadge shelf={onShelf.shelf} />}
        {choosing ? (
          <ShelfChooser
            title={book.title}
            current={onShelf?.shelf}
            onChoose={(shelf, card) => void choose(shelf, card)}
            onClose={() => setChoosing(false)}
            returnFocus={() => addButton.current}
          />
        ) : (
          // Not disabled while adding: it keeps focus, which a choice hands back to it.
          <button
            ref={addButton}
            type="button"
            className={shows.addButton}
            aria-busy={busy || undefined}
            aria-label={onShelf ? `Quick actions for ${book.title}` : `Add ${book.title} to your shelves`}
            aria-haspopup={onShelf ? "dialog" : undefined}
            aria-expanded={onShelf ? undefined : false}
            onClick={(e) => {
              if (busy) return;
              if (onShelf) openActions(onShelf, e.currentTarget.getBoundingClientRect());
              else setChoosing(true);
            }}
          >
            <AddMark added={!!onShelf} busy={busy} />
          </button>
        )}
      </span>
    </li>
  );
}

/** Catalogue cards in a grid, as many across as fit (search results). */
export function CatalogGrid({ books, label }: { books: readonly CatalogBook[]; label: string }) {
  return (
    <ul className={shows.grid} aria-label={label}>
      {books.map((book, i) => (
        <CatalogCard key={book.catalogId} book={book} index={i} />
      ))}
    </ul>
  );
}

/** Catalogue cards in one row that scrolls sideways (Discover's lists), as Shows' TitleRow. */
export function CatalogRow({ books, label }: { books: readonly CatalogBook[]; label: string }) {
  const drag = useDragScroll();
  return (
    <div className={shows.row}>
      {/* data-scrolls-sideways: on purpose (e2e/checks.ts). */}
      <ul className={shows.rowList} aria-label={label} data-scrolls-sideways {...drag}>
        {books.map((book, i) => (
          <CatalogCard key={book.catalogId} book={book} index={i} />
        ))}
      </ul>
    </div>
  );
}
