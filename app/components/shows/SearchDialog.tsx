"use client";
import { useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { SearchIcon } from "@/components/common/icons";
import { useAppView } from "@/hooks/useAppView";
import type { TitleSummary } from "@/lib/show-types";
import { useDebounced, useOpenTitle, useShowsData } from "./shows-data";
import { LoadError, SkeletonGrid, TitleGrid } from "./TitleGrid";
import styles from "./Shows.module.css";

// Searching starts once typing pauses for this long.
const debounceMs = 300;
// The last search, shown again when the panel reopens.
let lastQuery = "";

/** The search panel (panel id "search"), over any view: TV shows and movies on TMDB. */
export function SearchDialog() {
  const { closePanel } = useAppView();
  const openTitle = useOpenTitle();
  const [query, setQuery] = useState(lastQuery);
  const text = query.trim().replace(/\s+/g, " ");
  const debounced = useDebounced(text, debounceMs);
  const { data, error, loading, retry } = useShowsData<TitleSummary[]>(debounced ? `/discover/search?q=${encodeURIComponent(debounced)}` : null);
  // Typed, but not searched yet: keep showing the previous results meanwhile.
  const waiting = text !== debounced && !data;

  return <Dialog className={`${styles.dialog} ${styles.searchDialog}`} aria-label="Search" onClose={closePanel}>
    <div className={styles.dialogBody}>
      <form role="search" className={styles.searchBar} onSubmit={(e) => e.preventDefault()}>
        <SearchIcon />
        <input type="search" aria-label="Search TV shows and movies" placeholder="Search TV shows and movies" value={query}
          maxLength={100} autoComplete="off" spellCheck={false} enterKeyHint="search"
          onChange={(e) => { setQuery(e.target.value); lastQuery = e.target.value; }} />
        <button type="button" className={styles.textButton} onClick={closePanel}>Close</button>
      </form>
      <div className={styles.results} aria-busy={loading || waiting}>
        {!text ? <p className={styles.hint}>Find any TV show or movie by its title.</p>
          : loading || waiting ? <SkeletonGrid count={8} label="Searching…" />
          : error ? <LoadError message={error} onRetry={retry} />
          : data && <>
            <p role="status" className={data.length ? styles.srOnly : styles.empty}>
              {data.length ? `${data.length} result${data.length === 1 ? "" : "s"} for “${debounced}”` : `No TV shows or movies found for “${debounced}”.`}
            </p>
            {data.length > 0 && <TitleGrid titles={data} label="Search results" withType onOpen={openTitle} />}
          </>}
      </div>
    </div>
  </Dialog>;
}
