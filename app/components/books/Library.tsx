"use client";
import { useId, useState } from "react";
import { SearchIcon } from "@/components/common/icons";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { collapsedCount } from "@/components/shows/LibraryGrid";
import shows from "@/components/shows/Shows.module.css";
import { SkeletonGrid, useGridColumns } from "@/components/shows/TitleGrid";
import { useAppView } from "@/hooks/useAppView";
import { shelfLabels, type Book, type Shelf } from "@/lib/book-types";
import { BookCard } from "./BookCards";
import { ChangeError, useShelves } from "./books-data";
import styles from "./Books.module.css";

// The shelves, in this order: what is being read first.
const shelfOrder: readonly Shelf[] = ["currently-reading", "want-to-read", "finished"];

/** Past this many books, the Library has a search. */
const manyBooks = 6;

function DiscoverLink({ children }: { children: React.ReactNode }) {
  const { setView } = useAppView();
  return (
    <button type="button" className={shows.inlineLink} onClick={() => setView("discover")}>
      {children}
    </button>
  );
}

function Empty({ shelf }: { shelf: Shelf }) {
  return shelf === "currently-reading" ? (
    <>
      You&rsquo;re not reading anything yet — <DiscoverLink>explore Discover!</DiscoverLink>
    </>
  ) : shelf === "want-to-read" ? (
    <>
      Nothing on your list yet — <DiscoverLink>explore Discover!</DiscoverLink>
    </>
  ) : (
    "No finished books yet. Finished one? Move it to Finished from its page."
  );
}

/** A shelf: its heading and count, then whole rows of covers until Show all (as Shows' LibrarySection). */
function ShelfSection({ shelf, books, search }: { shelf: Shelf; books: readonly Book[] | null; search: string }) {
  const id = useId();
  const heading = shelfLabels[shelf];
  const [expanded, setExpanded] = useState(false);
  const { ref: gridRef, columns } = useGridColumns();
  const count = collapsedCount(columns);
  return (
    <section className={shows.section} aria-labelledby={id} aria-busy={!books}>
      <div className={shows.sectionHeader}>
        <h2 id={id}>{heading}</h2>
        {!!books?.length && (
          <span className={shows.count} aria-hidden="true">
            {books.length}
          </span>
        )}
      </div>
      {!books ? (
        <SkeletonGrid count={6} label={`Loading your ${heading} books…`} />
      ) : !books.length ? (
        <p className={shows.empty}>{search ? `No books in ${heading} match “${search}”.` : <Empty shelf={shelf} />}</p>
      ) : (
        <>
          <ul ref={gridRef} className={shows.grid} aria-label={heading}>
            {(expanded ? books : books.slice(0, count)).map((book) => (
              <li key={book.id}>
                <BookCard book={book} />
              </li>
            ))}
          </ul>
          {books.length > count && (
            <button
              type="button"
              className={shows.more}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show fewer" : `Show all ${books.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** No books yet: where to find some. */
function Welcome() {
  const { setView, openPanel } = useAppView();
  return (
    <div className={shows.welcome}>
      <h2>Start by discovering books!</h2>
      <p>
        Add books from Discover or search, then keep track of what you&rsquo;re reading, what&rsquo;s next and what
        you&rsquo;ve finished, page by page.
      </p>
      <div className={shows.offerButtons}>
        <Button variant="primary" onClick={() => setView("discover")}>
          Go to Discover
        </Button>
        <Button onClick={() => openPanel("search")}>Search</Button>
        <Button onClick={() => openPanel("new")}>Add a book yourself</Button>
      </div>
    </div>
  );
}

/** Library: Currently Reading, Want to Read and Finished, with a search once there are many books. */
export function Library() {
  const { books, loadError, reload } = useShelves();
  const [search, setSearch] = useState("");
  const controls = (books?.length ?? 0) > manyBooks;
  const query = controls ? search.trim().toLocaleLowerCase() : "";
  const matching =
    books?.filter((book) => !query || `${book.title} ${book.author}`.toLocaleLowerCase().includes(query)) ?? null;
  return (
    <div className={`${shows.view} ${styles.library}`}>
      {/* The Library tab shows which view this is. */}
      <h1 className={ui.srOnly}>Library</h1>
      <ChangeError className={shows.viewError} />
      {loadError && (
        <Alert className={shows.viewError} onRetry={reload}>
          {loadError}
        </Alert>
      )}
      {books?.length === 0 ? (
        <Welcome />
      ) : (
        <>
          {controls && (
            <div className={shows.libraryTop}>
              <div className={shows.libraryControls}>
                <label className={shows.librarySearch}>
                  <span className={ui.srOnly}>Search your books</span>
                  <SearchIcon />
                  <input
                    type="search"
                    value={search}
                    placeholder="Search your books"
                    autoComplete="off"
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
          {(!loadError || books) &&
            shelfOrder.map((shelf) => (
              <ShelfSection
                key={shelf}
                shelf={shelf}
                books={matching && matching.filter((book) => book.shelf === shelf)}
                search={query ? search.trim() : ""}
              />
            ))}
        </>
      )}
    </div>
  );
}
