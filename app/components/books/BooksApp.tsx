"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/common/AppShell";
import { BookIcon, CompassIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import { Dialog } from "@/components/common/Dialog";
import { Alert, Button } from "@/components/common/ui";
import { UndoToast, useUndo } from "@/components/common/Undo";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { apiRequest } from "@/lib/api-request";
import {
  bookInput,
  progressPercent,
  shelfLabels,
  shelves,
  type Book,
  type BookInput,
  type CatalogBook,
  type Shelf,
} from "@/lib/book-types";
import type { AppViewState } from "@/lib/app-views";
import type { Theme } from "@/lib/themes";
import { bookLists, bookListDetails, type BookList } from "@/lib/book-discovery";
import styles from "./Books.module.css";

const booksKey = ["books"];
const request = <T,>(url: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}) =>
  apiRequest<T>(url, { ...options, fallback: "Could not load or save your books. Please try again." });

function useBooks() {
  return useQuery({
    queryKey: booksKey,
    queryFn: ({ signal }) => request<Book[]>("/api/books", { signal }),
    meta: { persist: true },
  });
}

function Cover({ book }: { book: Pick<CatalogBook, "coverId" | "title"> }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.cover} aria-hidden="true">
      {book.coverId && !failed ? (
        // Covers are remote catalogue images; normal img avoids an unbounded image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg?default=false`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <BookIcon />
      )}
    </div>
  );
}

function useBookList(list: BookList) {
  return useQuery({
    queryKey: ["book-discover", list],
    queryFn: ({ signal }) => request<CatalogBook[]>(`/api/books/discover?list=${list}`, { signal }),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

function DiscoverList({ list, books }: { list: BookList; books: readonly Book[] }) {
  const query = useBookList(list);
  const { openPanel } = useAppView();
  const details = bookListDetails[list];
  const added = new Set(books.map((book) => book.catalogId));
  return (
    <section className={styles.shelf} aria-labelledby={`discover-${list}`}>
      <div className={styles.shelfHeading}>
        <h2 id={`discover-${list}`}>{details.title}</h2>
      </div>
      <p className={styles.muted}>{details.description}</p>
      {query.isPending && <p role="status">Loading {details.title.toLowerCase()} books…</p>}
      {query.error && <Alert onRetry={() => void query.refetch()}>{query.error.message}</Alert>}
      {query.isSuccess && query.data.length === 0 && <p>No books available in this list yet.</p>}
      <ul className={styles.grid}>
        {query.data?.map((book) => (
          <li key={book.catalogId} className={styles.card}>
            <div className={styles.discoverBook}>
              <Cover book={book} />
              <div className={styles.resultText}>
                <strong>{book.title}</strong>
                <span className={styles.muted}>{book.author || "Unknown author"}</span>
              </div>
            </div>
            <div className={styles.details}>
              <Button disabled={added.has(book.catalogId)} onClick={() => openPanel(`pick:${list}:${book.catalogId}`)}>
                {added.has(book.catalogId) ? "Added" : "Add to shelves"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BooksDiscover() {
  const books = useBooks();
  const { openPanel } = useAppView();
  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <h1 className={ui.heading}>Discover books</h1>
        <Button onClick={() => openPanel("search")}>Search books</Button>
      </div>
      <p className={styles.muted}>
        Find your next read with{" "}
        <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
          Open Library
        </a>
        .
      </p>
      {books.error && <Alert onRetry={() => void books.refetch()}>{books.error.message}</Alert>}
      {bookLists.map((list) => (
        <DiscoverList key={list} list={list} books={books.data ?? []} />
      ))}
    </div>
  );
}

function CatalogPanel({ list, id }: { list: BookList; id: string }) {
  const query = useBookList(list);
  const books = useBooks();
  const { closePanel } = useAppView();
  const catalog = query.data?.find((book) => book.catalogId === id);
  const existing = books.data?.find((book) => book.catalogId === id);
  if (existing) return <BookForm book={existing} onSaved={closePanel} />;
  if (catalog) return <BookForm catalog={catalog} onSaved={closePanel} />;
  return (
    <div className={styles.form}>
      {query.isPending ? (
        <p role="status">Loading book…</p>
      ) : query.error ? (
        <Alert onRetry={() => void query.refetch()}>{query.error.message}</Alert>
      ) : (
        <p>This book is no longer in this list. Search for it to add it to your shelves.</p>
      )}
      <Button onClick={closePanel}>Close</Button>
    </div>
  );
}

function ShelfView({
  shelf,
  filter,
  allBooks,
  onRemove,
  removing,
}: {
  shelf: Shelf;
  filter: string;
  allBooks: readonly Book[];
  onRemove: (book: Book) => void;
  removing: boolean;
}) {
  const { openPanel } = useAppView();
  const onShelf = allBooks.filter((book) => book.shelf === shelf);
  const visible = onShelf.filter((book) =>
    `${book.title} ${book.author}`.toLowerCase().includes(filter.toLowerCase().trim()),
  );
  return (
    <section className={styles.shelf} aria-labelledby={`shelf-${shelf}`}>
      <div className={styles.shelfHeading}>
        <h2 id={`shelf-${shelf}`}>{shelfLabels[shelf]}</h2>
        <span className={styles.muted}>
          {onShelf.length} {onShelf.length === 1 ? "book" : "books"}
        </span>
      </div>
      {visible.length === 0 && (
        <p className={styles.muted}>{filter ? "No matching books on this shelf." : "No books on this shelf yet."}</p>
      )}
      <ul className={styles.grid}>
        {visible.map((book) => {
          const percent = progressPercent(book);
          return (
            <li key={book.id} className={styles.card}>
              <button className={styles.bookButton} onClick={() => openPanel(`book:${book.id}`)}>
                <Cover book={book} />
                <span className={styles.details}>
                  <strong>{book.title}</strong>
                  <span className={styles.muted}>{book.author || "Unknown author"}</span>
                </span>
              </button>
              <div className={styles.details}>
                {shelf !== "want-to-read" && (
                  <>
                    <span className={styles.muted}>
                      {book.pagesRead}
                      {book.totalPages ? ` of ${book.totalPages}` : ""} pages{percent !== null ? ` · ${percent}%` : ""}
                    </span>
                    {percent !== null && (
                      <progress aria-label={`Reading progress for ${book.title}`} max={100} value={percent} />
                    )}
                  </>
                )}
                <div className={styles.actions}>
                  <Button onClick={() => openPanel(`book:${book.id}`)}>
                    {shelf === "currently-reading" ? "Update progress" : "Edit book"}
                  </Button>
                  <Button variant="remove" disabled={removing} onClick={() => onRemove(book)}>
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BooksLibrary() {
  const books = useBooks();
  const { openPanel } = useAppView();
  const [filter, setFilter] = useState("");
  const client = useQueryClient();
  const undo = useUndo();
  const remove = useMutation({
    networkMode: "always",
    mutationFn: (id: string) => request(`/api/books/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: booksKey }),
  });
  const visibleBooks = (books.data ?? []).filter((book) => book.id !== undo.pending?.id);
  function onRemove(book: Book) {
    undo.schedule({ id: book.id, label: `Removed "${book.title}"`, commit: () => remove.mutate(book.id) });
  }
  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <h1 className={ui.heading}>Books</h1>
        <Button variant="primary" onClick={() => openPanel("search")}>
          Add book
        </Button>
      </div>
      <label className={styles.filter}>
        Search your books
        <input
          type="search"
          className={ui.input}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Title or author"
        />
      </label>
      {books.isPending && <p role="status">Loading your books…</p>}
      {books.error && <Alert onRetry={() => void books.refetch()}>{books.error.message}</Alert>}
      {remove.error && <Alert onDismiss={() => remove.reset()}>{remove.error.message}</Alert>}
      {shelves.map((shelf) => (
        <ShelfView
          key={shelf}
          shelf={shelf}
          filter={filter}
          allBooks={visibleBooks}
          onRemove={onRemove}
          removing={remove.isPending}
        />
      ))}
      <UndoToast undo={undo} />
    </div>
  );
}

function BookForm({ book, catalog, onSaved }: { book?: Book; catalog?: CatalogBook; onSaved: () => void }) {
  const { closePanel } = useAppView();
  const client = useQueryClient();
  const [title, setTitle] = useState(book?.title ?? catalog?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? catalog?.author ?? "");
  const [total, setTotal] = useState(String(book?.totalPages ?? catalog?.totalPages ?? ""));
  const [pages, setPages] = useState(String(book?.pagesRead ?? 0));
  const [shelf, setShelf] = useState<Shelf>(book?.shelf ?? "want-to-read");
  const [error, setError] = useState("");
  const save = useMutation({
    networkMode: "always",
    mutationFn: (body: BookInput) =>
      request<Book>(book ? `/api/books/${book.id}` : "/api/books", { method: book ? "PATCH" : "POST", body }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: booksKey });
      onSaved();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = bookInput.safeParse({
      title,
      author,
      totalPages: total === "" ? null : Number(total),
      pagesRead: shelf === "want-to-read" ? 0 : shelf === "finished" && total ? Number(total) : Number(pages),
      shelf,
      catalogId: book?.catalogId ?? catalog?.catalogId ?? null,
      coverId: book?.coverId ?? catalog?.coverId ?? null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    save.mutate(parsed.data);
  }
  return (
    <form onSubmit={submit} className={styles.form}>
      <h2 className={ui.heading}>{book ? "Edit book" : "Add book"}</h2>
      {(error || save.error) && <Alert>{error || save.error?.message}</Alert>}
      <label>
        Title
        <input className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
      </label>
      <label>
        Author
        <input className={ui.input} value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={500} />
      </label>
      <label>
        Shelf
        <select
          aria-label="Shelf"
          className={ui.input}
          value={shelf}
          onChange={(e) => setShelf(e.target.value as Shelf)}
        >
          {shelves.map((s) => (
            <option key={s} value={s}>
              {shelfLabels[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Total pages
        <input
          className={ui.input}
          type="number"
          min={1}
          max={100000}
          step={1}
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="Optional"
        />
      </label>
      {catalog?.totalPages && !book && (
        <p className={styles.muted}>Page counts vary by edition. Adjust this to match your copy.</p>
      )}
      {shelf === "currently-reading" && (
        <label>
          Pages read
          <input
            className={ui.input}
            type="number"
            min={0}
            max={total ? Number(total) : 100000}
            step={1}
            required
            value={pages}
            onChange={(e) => setPages(e.target.value)}
          />
        </label>
      )}
      <p className={styles.muted}>
        {shelf === "finished"
          ? "Finished books are marked as fully read."
          : shelf === "want-to-read"
            ? "Moving to Want to Read resets page progress."
            : "Reaching the last page moves this book to Finished."}
      </p>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" busy={save.isPending}>
          Save
        </Button>
        <Button onClick={closePanel} disabled={save.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SearchBooks() {
  const { closePanel, openPanel } = useAppView();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogBook | null>(null);
  const books = useBooks();
  const search = useQuery({
    queryKey: ["book-search", query],
    queryFn: ({ signal }) => request<CatalogBook[]>(`/api/books/search?q=${encodeURIComponent(query)}`, { signal }),
    enabled: query.length >= 2,
    retry: false,
  });
  if (selected)
    return (
      <>
        <Button onClick={() => setSelected(null)}>Back to search</Button>
        <BookForm catalog={selected} onSaved={closePanel} />
      </>
    );
  const added = new Set((books.data ?? []).map((book) => book.catalogId));
  return (
    <div className={styles.form}>
      <h2 className={ui.heading}>Find your next book</h2>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          const next = text.trim();
          if (next === query) void search.refetch();
          else setQuery(next);
        }}
      >
        <label>
          Title, author or ISBN
          <input
            className={ui.input}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            minLength={2}
            maxLength={200}
            required
          />
        </label>
        <Button type="submit" busy={search.isFetching}>
          Search
        </Button>
      </form>
      <Button onClick={() => openPanel("new")}>Add manually</Button>
      {search.error && <Alert onRetry={() => void search.refetch()}>{search.error.message}</Alert>}
      {search.isFetching && <p role="status">Searching books…</p>}
      {query && search.isSuccess && search.data.length === 0 && (
        <p role="status">No books found. Try another search or add your book manually.</p>
      )}
      <ul className={styles.results}>
        {search.data?.map((book) => (
          <li key={book.catalogId}>
            <Cover book={book} />
            <div className={styles.resultText}>
              <strong>{book.title}</strong>
              <span className={styles.muted}>{book.author || "Unknown author"}</span>
            </div>
            <Button disabled={added.has(book.catalogId)} onClick={() => setSelected(book)}>
              {added.has(book.catalogId) ? "Added" : "Add"}
            </Button>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        Book search by{" "}
        <a href="https://openlibrary.org" target="_blank" rel="noreferrer">
          Open Library
        </a>
        .
      </p>
      <Button onClick={closePanel}>Close</Button>
    </div>
  );
}

function Panels() {
  const { panels, closePanel } = useAppView();
  const books = useBooks();
  const panel = panels.at(-1);
  if (!panel) return null;
  const bookId = panel.startsWith("book:") ? panel.slice(5) : null;
  const book = books.data?.find((entry) => entry.id === bookId);
  const [, pickList, pickId] = panel.split(":");
  const list = panel.startsWith("pick:") ? bookLists.find((entry) => entry === pickList) : undefined;
  return (
    <Dialog
      key={panel}
      className={styles.dialog}
      aria-label={panel === "search" ? "Find a book" : bookId ? "Edit book" : "Add book"}
      onClose={closePanel}
    >
      {list && /^OL\d+W$/.test(pickId ?? "") ? (
        <CatalogPanel list={list} id={pickId} />
      ) : panel === "search" ? (
        <SearchBooks />
      ) : panel === "new" ? (
        <BookForm onSaved={closePanel} />
      ) : book ? (
        <BookForm book={book} onSaved={closePanel} />
      ) : (
        <div className={styles.form}>
          {books.isPending ? (
            <p role="status">Loading book…</p>
          ) : books.error ? (
            <Alert onRetry={() => void books.refetch()}>{books.error.message}</Alert>
          ) : (
            <p>Book not found.</p>
          )}
          <Button onClick={closePanel}>Close</Button>
        </div>
      )}
    </Dialog>
  );
}

export function BooksApp({
  user,
  theme,
  initial,
  version,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
  theme: Theme;
  initial: AppViewState;
  version: string;
}) {
  const tabs = useMemo(
    () => [
      { id: "library", label: "Books", icon: <BookIcon />, view: <BooksLibrary /> },
      { id: "discover", label: "Discover", icon: <CompassIcon />, view: <BooksDiscover /> },
    ],
    [],
  );
  return (
    <QueryProvider userId={user.id} version={version}>
      <AppShell
        name="Books"
        basePath="/books"
        initial={initial}
        username={user.username}
        avatarUrl={user.avatarUrl}
        theme={theme}
        tabs={tabs}
      >
        <Panels />
      </AppShell>
    </QueryProvider>
  );
}
