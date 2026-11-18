"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon, PencilIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import shows from "@/components/shows/Shows.module.css";
import { Overview } from "@/components/shows/TitleDialog";
import { useAppView } from "@/hooks/useAppView";
import {
  progressPercent,
  shareRead,
  shelfShortLabels,
  shelves,
  type Book,
  type CatalogBook,
  type Shelf,
} from "@/lib/book-types";
import { catalogInput, ChangeError, seenCatalogBook, useCatalogBook, useShelves } from "./books-data";
import { Cover, OpenLibraryAttribution, ShelfPicker, shelfIcons, shelfStatus } from "./BookParts";
import styles from "./Books.module.css";

/**
 * Pages read, typed in and saved with Save (or Enter): from 0 to the book's
 * page count. Reaching the last page moves the book to Finished (on the
 * server too: lib/book-types.ts, normalizeProgress). Key it by the pages read,
 * so it shows them again once saved.
 */
export function PagesForm({ book }: { book: Book }) {
  const { change } = useShelves();
  const id = useId();
  const [error, setError] = useState("");
  const max = book.totalPages ?? 100000;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("pages") ?? "").trim();
    const pages = Number(text);
    if (!text || !Number.isInteger(pages) || pages < 0 || pages > max) {
      setError(book.totalPages ? `Enter a page from 0 to ${book.totalPages}.` : "Enter how many pages you’ve read.");
      return;
    }
    setError("");
    if (pages !== book.pagesRead) change(book, { pagesRead: pages });
  }
  return (
    <form className={styles.pagesForm} onSubmit={save} noValidate>
      <label htmlFor={id}>Pages read</label>
      <div className={styles.pagesRow}>
        <input
          id={id}
          name="pages"
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          defaultValue={book.pagesRead}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : book.totalPages ? `${id}-of` : undefined}
        />
        {book.totalPages && (
          <span id={`${id}-of`} className={styles.ofPages}>
            of {book.totalPages}
          </span>
        )}
        <Button type="submit">Save</Button>
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </form>
  );
}

// A book being read: how far (a bar, and the pages in words), and the pages
// read to change, in a panel of its own (as a show's progress in Shows).
function ReadingProgress({ book }: { book: Book }) {
  const id = useId();
  const percent = progressPercent(book);
  return (
    <div className={shows.library}>
      <div className={shows.progress} role="group" aria-labelledby={id}>
        <div className={shows.progressHeader}>
          <span id={id} className={shows.label}>
            Progress
          </span>
          <span className={shows.progressValue}>
            {percent !== null ? `${percent}%` : `${book.pagesRead} ${book.pagesRead === 1 ? "page" : "pages"}`}
          </span>
        </div>
        {book.totalPages !== null && (
          <div className={shows.progressTrack} aria-hidden="true">
            <span style={{ "--share": shareRead(book) } as React.CSSProperties} />
          </div>
        )}
        <p className={shows.progressNote}>
          {book.totalPages !== null
            ? `${book.pagesRead} of ${book.totalPages} pages read. The last page moves it to Finished.`
            : "Add its number of pages (Edit details) to see how far you are."}
        </p>
        <PagesForm key={book.pagesRead} book={book} />
      </div>
    </div>
  );
}

/** Want to Read, Reading and Finished as three tiles, for a catalogue book not on a shelf (as Add to Library in Shows). */
function AddToShelves({ book, firstRef }: { book: CatalogBook | undefined; firstRef: React.Ref<HTMLButtonElement> }) {
  const id = useId();
  const { add } = useShelves();
  const [adding, setAdding] = useState<Shelf | null>(null);
  const [error, setError] = useState("");
  async function choose(shelf: Shelf) {
    if (!book) return;
    setAdding(shelf);
    setError("");
    try {
      await add(catalogInput(book, shelf));
    } catch (err) {
      setError((err as Error).message);
      setAdding(null);
    }
  }
  return (
    <div className={shows.addGroup} role="group" aria-labelledby={id}>
      <h3 id={id}>Add to your shelves</h3>
      <div className={shows.addButtons}>
        {shelves.map((shelf, i) => {
          const Icon = shelfIcons[shelf];
          return (
            <button
              key={shelf}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className={shows.addOption}
              data-status={shelfStatus[shelf]}
              disabled={!book || adding !== null}
              onClick={() => void choose(shelf)}
            >
              <Icon />
              {adding === shelf ? "Adding…" : shelfShortLabels[shelf]}
            </button>
          );
        })}
      </div>
      {error && <Alert className={styles.addError}>{error}</Alert>}
    </div>
  );
}

/** A book's panel that has nothing to show: still loading, or not on the shelves anymore. */
function NotFound({ onClose }: { onClose: () => void }) {
  const headingId = useId();
  const { books, loadError, reload } = useShelves();
  return (
    <Dialog className={`${shows.dialog} ${shows.menuDialog}`} aria-labelledby={headingId} onClose={onClose}>
      <div className={shows.dialogBody}>
        <div className={shows.dialogHeader}>
          <h2 id={headingId}>{books || loadError ? "Book not found" : "Loading…"}</h2>
          <button type="button" className={shows.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {loadError ? (
          <Alert onRetry={reload}>{loadError}</Alert>
        ) : books ? (
          <p className={ui.muted}>It isn&rsquo;t on your shelves anymore, on this device or another.</p>
        ) : (
          <Spinner label="Loading your books…" />
        )}
      </div>
    </Dialog>
  );
}

/**
 * A book's panel ("book:<id>" for one on the shelves, "work:OL…W" for one from
 * the catalogue), laid out as Shows' title panel over a blurred copy of its
 * cover. On one side the cover, the title, the author and its facts, then its
 * shelf (Want to Read | Reading | Finished); on the other, a book being read's
 * progress first, the description from Open Library, Add to your shelves (not
 * on one yet), then Edit details and Remove from shelves. Removed, the panel
 * stays, saying so with Undo (as the app's Undo message does once it's closed).
 */
export function BookDialog({
  bookId,
  catalogId,
  onClose,
}: {
  bookId?: string;
  catalogId?: string;
  onClose: () => void;
}) {
  const headingId = useId();
  const descriptionId = useId();
  const { openPanel } = useAppView();
  const { byId, byCatalogId, change, remove, undo } = useShelves();
  const [removed, setRemoved] = useState<Book | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const firstAdd = useRef<HTMLButtonElement>(null);
  // The book on the shelves; a catalogue book added again after it was removed here is it too.
  const book = (bookId ? byId(bookId) : undefined) ?? byCatalogId(catalogId ?? removed?.catalogId);
  // Removed here, and not back: still shown, with Undo until its Undo has gone.
  const gone = removed && !book ? removed : null;
  const canUndo = !!gone && undo.pending?.id === gone.id;
  // The focused Remove button is gone: on to Undo.
  useEffect(() => {
    if (removed) (undoButton.current ?? firstAdd.current)?.focus();
  }, [removed]);
  const workId = (book ?? gone)?.catalogId ?? catalogId ?? null;
  const work = useCatalogBook(workId);
  const catalog = work.data ?? (workId ? seenCatalogBook(workId) : undefined);
  const shown = book ?? gone ?? catalog;
  if (bookId && !book && !gone) return <NotFound onClose={onClose} />;

  const totalPages = shown?.totalPages ?? null;
  const facts = [work.data?.year && `First published ${work.data.year}`, totalPages && `${totalPages} pages`]
    .filter(Boolean)
    .join(" · ");
  return (
    <Dialog className={`${shows.dialog} ${shows.titleDialog}`} aria-labelledby={headingId} onClose={onClose}>
      <div className={shows.dialogBody}>
        {shown?.coverId && (
          <div className={shows.titleBackdrop} aria-hidden="true">
            <Cover book={shown} large className={styles.backdropCover} />
          </div>
        )}
        {/* Stays at the top while the panel scrolls; takes no room of its own. */}
        <div className={shows.closeBar}>
          <button type="button" className={shows.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className={shows.titlePage}>
          <div className={shows.titleAside}>
            <div className={shows.titlePoster}>
              {shown ? (
                <Cover book={shown} large className={shows.detailPoster} />
              ) : (
                <span className={`${shows.poster} ${shows.skeleton} ${shows.detailPoster}`} />
              )}
            </div>
            <div className={shows.titleHead}>
              <h2 id={headingId}>{shown?.title ?? "Loading…"}</h2>
              {shown && <p className={styles.author}>{shown.author || "Unknown author"}</p>}
              {facts && <p className={shows.titleFacts}>{facts}</p>}
              {!!work.data?.subjects.length && <p className={shows.genres}>{work.data.subjects.join(" · ")}</p>}
            </div>
            {book && (
              <section className={shows.libraryStatus} aria-label="Your shelves">
                <p role="status" className={ui.srOnly}>
                  On your shelves
                </p>
                <ChangeError className={shows.changeError} />
                <ShelfPicker icons shelf={book.shelf} onChange={(shelf) => change(book, { shelf })} />
              </section>
            )}
          </div>
          <div className={shows.titleMain}>
            {gone && (
              <p role="status" className={shows.removedNotice}>
                Removed from your shelves.
                {canUndo && (
                  <Button ref={undoButton} variant="quiet" onClick={undo.undo}>
                    Undo
                  </Button>
                )}
              </p>
            )}
            {book?.shelf === "currently-reading" && <ReadingProgress book={book} />}
            {workId && (
              <section className={shows.synopsis} aria-labelledby={descriptionId}>
                <h3 id={descriptionId}>Description</h3>
                {work.error ? (
                  <Alert onRetry={() => void work.refetch()}>{work.error.message}</Alert>
                ) : !work.data ? (
                  <div className={shows.overviewSkeleton} aria-busy="true">
                    <p role="status" className={ui.srOnly}>
                      Loading the description…
                    </p>
                    {[1, 2, 3].map((line) => (
                      <span key={line} className={`${shows.skeletonLine} ${shows.skeleton}`} />
                    ))}
                  </div>
                ) : (
                  <Overview
                    key={work.data.description}
                    text={work.data.description || "No description on Open Library yet."}
                  />
                )}
              </section>
            )}
            {!book && !canUndo && workId && <AddToShelves book={catalog} firstRef={firstAdd} />}
            {book && (
              <div className={`${shows.removeArea} ${styles.bookActions}`}>
                <Button onClick={() => openPanel(`edit:${book.id}`)}>
                  <PencilIcon />
                  Edit details
                </Button>
                <Button
                  variant="remove"
                  onClick={() => {
                    remove(book);
                    setRemoved(book);
                  }}
                >
                  Remove from shelves
                </Button>
              </div>
            )}
            {workId && <OpenLibraryAttribution catalogId={workId} />}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
