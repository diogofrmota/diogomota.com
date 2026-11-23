"use client";
import { useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { SearchIcon } from "@/components/common/icons";
import { Alert } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useDebounced } from "@/hooks/useDebounced";
import shows from "@/components/shows/Shows.module.css";
import { SkeletonGrid } from "@/components/shows/TitleGrid";
import { useAppView } from "@/hooks/useAppView";
import { CatalogGrid } from "./BookCards";
import { useBookSearch } from "./books-data";
import { OpenLibraryAttribution } from "./BookParts";
import styles from "./Books.module.css";

// Searching starts once typing pauses for this long.
const debounceMs = 400;
// The last search, shown again when the panel reopens.
let lastQuery = "";

/**
 * The search panel (panel "search"), over any view: books on Open Library by
 * title, author or ISBN, as cards with + to put one on a shelf; and, for one
 * it doesn't have, Add a book yourself.
 */
export function SearchDialog() {
  const { closePanel, openPanel } = useAppView();
  const [query, setQuery] = useState(lastQuery);
  const text = query.trim().replace(/\s+/g, " ");
  const debounced = useDebounced(text, debounceMs);
  const search = useBookSearch(debounced);
  const searched = debounced.length >= 2;
  // Typed, but not searched yet: the skeleton meanwhile.
  const waiting = text !== debounced || (searched && search.isPending);
  const addYourself = (
    <p className={styles.addYourself}>
      Can&rsquo;t find it?{" "}
      <button type="button" className={shows.textButton} onClick={() => openPanel("new")}>
        Add a book yourself
      </button>
    </p>
  );

  return (
    <Dialog className={`${shows.dialog} ${shows.searchDialog}`} aria-label="Search books" onClose={closePanel}>
      <div className={shows.dialogBody}>
        <form role="search" className={shows.searchBar} onSubmit={(e) => e.preventDefault()}>
          <SearchIcon />
          <input
            type="search"
            aria-label="Search books"
            placeholder="Title, author or ISBN"
            value={query}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            data-autofocus
            onChange={(e) => {
              setQuery(e.target.value);
              lastQuery = e.target.value;
            }}
          />
          <button type="button" className={shows.textButton} onClick={closePanel}>
            Close
          </button>
        </form>
        <div className={shows.results} aria-busy={waiting}>
          {!text ? (
            <p className={shows.hint}>Find any book by its title, its author or its ISBN.</p>
          ) : text.length < 2 ? (
            <p className={shows.hint}>Keep typing: at least 2 characters.</p>
          ) : waiting ? (
            <SkeletonGrid count={8} label="Searching…" />
          ) : search.error ? (
            <Alert onRetry={() => void search.refetch()}>{search.error.message}</Alert>
          ) : (
            search.data && (
              <>
                <p role="status" className={search.data.length ? ui.srOnly : shows.empty}>
                  {search.data.length
                    ? `${search.data.length} result${search.data.length === 1 ? "" : "s"} for “${debounced}”`
                    : `No books found for “${debounced}”.`}
                </p>
                {search.data.length > 0 && <CatalogGrid books={search.data} label="Search results" />}
              </>
            )
          )}
        </div>
        {addYourself}
        <OpenLibraryAttribution />
      </div>
    </Dialog>
  );
}
