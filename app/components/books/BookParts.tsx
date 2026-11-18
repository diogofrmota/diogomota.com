"use client";
import { useId, useState } from "react";
import { BookIcon, BookmarkIcon, DoneIcon, SearchIcon } from "@/components/common/icons";
import { SegmentThumb } from "@/components/common/motion";
import shows from "@/components/shows/Shows.module.css";
import { useAppView } from "@/hooks/useAppView";
import {
  coverUrl,
  shareRead,
  shelfShortLabels,
  shelves,
  type Book,
  type CatalogBook,
  type Shelf,
} from "@/lib/book-types";
import styles from "./Books.module.css";

// Books looks as Shows does (docs: README.md, Books): the same poster grids and
// rows, badges, panels and pickers, from Shows.module.css. A shelf takes the
// look of the Shows status it is like: Want to Read of Planned, Reading of
// Watching, Finished of Completed.

/** The Shows status whose look each shelf has (its badge's color, its line on a cover). */
export const shelfStatus: Record<Shelf, "planned" | "watching" | "completed"> = {
  "want-to-read": "planned",
  "currently-reading": "watching",
  finished: "completed",
};

/** Each shelf's icon: Want to Read a bookmark, Reading an open book, Finished a tick. */
export const shelfIcons: Record<Shelf, () => React.ReactNode> = {
  "want-to-read": BookmarkIcon,
  "currently-reading": BookIcon,
  finished: DoneIcon,
};

/**
 * A book's cover from Open Library, 2:3 like a poster (M, or L on a sharper
 * screen; L for a panel). Without one, or when it fails to load, the title on
 * a tinted card in its place, drawn by CSS (as Shows' Poster does). Decorative:
 * the card's label says the title.
 */
export function Cover({
  book,
  large = false,
  className = "",
}: {
  book: Pick<CatalogBook, "coverId" | "title">;
  large?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<number | null>(null);
  if (!book.coverId || failed === book.coverId)
    return (
      <span
        className={`${shows.poster} ${shows.noPoster} ${styles.blankCover} ${className}`}
        data-title={book.title}
        aria-hidden="true"
      />
    );
  const { coverId } = book;
  return (
    // Open Library's covers come straight from it, in its fixed sizes: no image proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl(coverId, large ? "L" : "M")}
      srcSet={large ? undefined : `${coverUrl(coverId, "M")} 1x, ${coverUrl(coverId, "L")} 2x`}
      alt=""
      loading="lazy"
      draggable={false}
      className={`${shows.poster} ${className}`}
      onError={() => setFailed(coverId)}
    />
  );
}

/** Reading or Finished, at the top left of a catalogue book's cover once it's on a shelf. Decorative. */
export function ShelfBadge({ shelf }: { shelf: Shelf }) {
  return (
    <span className={`${shows.badge} ${shows[shelfStatus[shelf]]}`} aria-hidden="true">
      {shelfShortLabels[shelf]}
    </span>
  );
}

/**
 * Along the bottom of a cover: as far as the book has been read (in Reading's
 * blue), all the way once finished (in green). Put it in the cover's frame. Decorative.
 */
export function ReadLine({ book }: { book: Pick<Book, "shelf" | "totalPages" | "pagesRead"> }) {
  if (book.shelf === "want-to-read") return null;
  return (
    <span className={shows.posterProgress} aria-hidden="true">
      <span
        className={`${shows.posterProgressLine} ${shows[shelfStatus[book.shelf]]}`}
        data-testid="progress-line"
        style={{ "--share": shareRead(book) } as React.CSSProperties}
      />
    </span>
  );
}

/**
 * Want to Read | Reading | Finished, the current one pressed (with icons in a
 * book's panel): its thumb slides to the one chosen, as Shows' status picker's.
 */
export function ShelfPicker({
  shelf,
  onChange,
  icons = false,
}: {
  shelf: Shelf;
  onChange: (shelf: Shelf) => void;
  icons?: boolean;
}) {
  const layoutId = `shelf-picker:${useId()}`;
  return (
    <div className={shows.statusPicker} role="group" aria-label="Shelf">
      {shelves.map((option) => {
        const Icon = shelfIcons[option];
        return (
          <button
            key={option}
            type="button"
            aria-pressed={option === shelf}
            data-status={shelfStatus[option]}
            onClick={() => {
              if (option !== shelf) onChange(option);
            }}
          >
            {icons && <Icon />}
            {shelfShortLabels[option]}
            {option === shelf && <SegmentThumb layoutId={layoutId} className={shows.thumb} />}
          </button>
        );
      })}
    </div>
  );
}

/** A search field look-alike that opens the search panel (Discover, as Shows'). */
export function SearchLauncher() {
  const { openPanel } = useAppView();
  return (
    <button type="button" className={shows.launcher} data-press="wide" onClick={() => openPanel("search")}>
      <SearchIcon />
      <span>Search books by title, author or ISBN</span>
    </button>
  );
}

/** Where the books come from, at the bottom of Discover and of a book's panel. */
export function OpenLibraryAttribution({ catalogId }: { catalogId?: string | null }) {
  return (
    <footer className={shows.attribution}>
      <p>
        Book details and covers from{" "}
        <a
          href={catalogId ? `https://openlibrary.org/works/${catalogId}` : "https://openlibrary.org"}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Library
        </a>
        .
      </p>
    </footer>
  );
}
