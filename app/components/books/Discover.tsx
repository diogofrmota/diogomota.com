"use client";
import { useId } from "react";
import { Alert } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useNearScreen } from "@/components/shows/Discover";
import shows from "@/components/shows/Shows.module.css";
import { SkeletonGrid } from "@/components/shows/TitleGrid";
import { bookListDetails, bookLists, type BookList } from "@/lib/book-discovery";
import { CatalogRow } from "./BookCards";
import { useBookList } from "./books-data";
import { OpenLibraryAttribution, SearchLauncher } from "./BookParts";

// A list: its heading and what it is, then a row of up to 12 books that
// scrolls sideways. It loads once it comes near the screen, as Shows' do.
function ListSection({ list }: { list: BookList }) {
  const id = useId();
  const noteId = useId();
  const [ref, near] = useNearScreen<HTMLElement>();
  const { data, error, isPending, refetch } = useBookList(list, near);
  const { title, description } = bookListDetails[list];
  const loading = !near || isPending;
  return (
    <section ref={ref} className={shows.section} aria-labelledby={id} aria-describedby={noteId} aria-busy={loading}>
      <h2 id={id}>{title}</h2>
      <p id={noteId} className={shows.sectionNote}>
        {description}
      </p>
      {error ? (
        <Alert onRetry={() => void refetch()}>{error.message}</Alert>
      ) : loading ? (
        <SkeletonGrid row count={8} label={`Loading ${title.toLowerCase()} books…`} />
      ) : !data?.length ? (
        <p className={shows.empty}>No books in this list right now.</p>
      ) : (
        <CatalogRow books={data} label={`${title} books`} />
      )}
    </section>
  );
}

/** Discover: the search field, then Open Library's lists, and where they come from at the bottom. */
export function Discover() {
  return (
    <div className={shows.view}>
      {/* The Discover tab shows which view this is. */}
      <h1 className={ui.srOnly}>Discover</h1>
      <div className={shows.discoverTop}>
        <SearchLauncher />
      </div>
      {bookLists.map((list) => (
        <ListSection key={list} list={list} />
      ))}
      <OpenLibraryAttribution />
    </div>
  );
}
