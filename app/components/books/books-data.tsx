"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/common/ui";
import { useUndo } from "@/components/common/Undo";
import { useAppView } from "@/hooks/useAppView";
import { apiRequest, type ApiError } from "@/lib/api-request";
import type { BookList } from "@/lib/book-discovery";
import {
  normalizeProgress,
  type Book,
  type BookInput,
  type CatalogBook,
  type CatalogBookDetail,
  type Shelf,
} from "@/lib/book-types";

// Books' data, as Shows' library (components/shows/library.tsx) is Shows': the
// user's books (kept in this browser for offline reading), changed at once on
// screen and then on the server, which has the last word. Removing a book hides
// it at once, with Undo, and deletes it once the Undo has gone.

export const booksKey = ["books"] as const;

/** Calls one of Books' APIs and returns its data, or throws an ApiError with its message. */
export function booksRequest<T>(
  url: string,
  options: { method?: string; body?: object; signal?: AbortSignal; keepalive?: boolean } = {},
) {
  return apiRequest<T>(url, { ...options, fallback: "Could not load or save your books. Please try again." });
}

const inputOf = ({ catalogId, title, author, coverId, totalPages, pagesRead, shelf }: Book): BookInput => ({
  catalogId,
  title,
  author,
  coverId,
  totalPages,
  pagesRead,
  shelf,
});

/** Last changed first: what is being read now leads its shelf. */
const byUpdated = (a: Book, b: Book) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);

type Shelves = {
  /** The user's books, last changed first, without one just removed (its Undo showing); null while loading. */
  books: Book[] | null;
  loadError: string;
  reload: () => void;
  /** A book on the shelves, by its id. */
  byId: (id: string) => Book | undefined;
  /** The book on the shelves from this catalogue work, if any. */
  byCatalogId: (catalogId: string | null | undefined) => Book | undefined;
  /** Adds a book (resolves to it once the server has it), or throws with why it couldn't. */
  add: (input: BookInput) => Promise<Book>;
  /** Changes a book: at once on screen, then on the server. */
  change: (book: Book, changes: Partial<BookInput>) => void;
  /** Removes a book, with Undo for a few seconds before it's deleted. */
  remove: (book: Book) => void;
  /** Why the last change was refused, if it was. */
  changeError: string;
  dismissError: () => void;
  undo: ReturnType<typeof useUndo>;
};

const ShelvesContext = createContext<Shelves | null>(null);

export function ShelvesProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: booksKey,
    queryFn: ({ signal }) => booksRequest<Book[]>("/api/books", { signal }),
    meta: { persist: true },
  });
  const undo = useUndo();
  const [changeError, setChangeError] = useState("");
  // The latest change of each book: an older one's answer is let go.
  const versions = useRef(new Map<string, number>());
  // Each book's changes go to the server one after another, in the order they
  // were made: each sends the whole book, so the last one made is the one kept.
  const queues = useRef(new Map<string, Promise<unknown>>());
  function send<T>(id: string, method: "PATCH" | "DELETE", body?: BookInput): Promise<T> {
    const previous = queues.current.get(id) ?? Promise.resolve();
    // keepalive: sent, it is done even if the page is reloaded or left meanwhile.
    const request = previous
      .catch(() => {})
      .then(() => booksRequest<T>(`/api/books/${id}`, { method, body, keepalive: true }));
    queues.current.set(id, request);
    void request
      .finally(() => {
        if (queues.current.get(id) === request) queues.current.delete(id);
      })
      .catch(() => {});
    return request;
  }

  const all = query.data;
  const hidden = undo.pending?.id;
  const books = useMemo(() => all?.filter((book) => book.id !== hidden).sort(byUpdated) ?? null, [all, hidden]);

  const setBooks = (update: (books: Book[]) => Book[]) =>
    client.setQueryData<Book[]>(booksKey, (current) => current && update(current));
  const failed = (error: unknown) => {
    setChangeError((error as ApiError).message);
    void client.invalidateQueries({ queryKey: booksKey });
  };

  function change(book: Book, changes: Partial<BookInput>) {
    const next = normalizeProgress({ ...inputOf(book), ...changes });
    const version = (versions.current.get(book.id) ?? 0) + 1;
    versions.current.set(book.id, version);
    setChangeError("");
    void client.cancelQueries({ queryKey: booksKey });
    setBooks((list) =>
      list.map((entry) => (entry.id === book.id ? { ...entry, ...next, updatedAt: new Date().toISOString() } : entry)),
    );
    send<Book>(book.id, "PATCH", next).then(
      (saved) => {
        if (versions.current.get(book.id) === version)
          setBooks((list) => list.map((entry) => (entry.id === saved.id ? saved : entry)));
      },
      (error) => {
        if (versions.current.get(book.id) === version) failed(error);
      },
    );
  }

  async function add(input: BookInput): Promise<Book> {
    setChangeError("");
    // Just removed, its Undo still showing: it is still on the server, so it is put back.
    const removed = all?.find((book) => book.id === hidden);
    if (removed && input.catalogId && removed.catalogId === input.catalogId) {
      undo.undo();
      if (removed.shelf !== input.shelf) change(removed, { shelf: input.shelf });
      return removed;
    }
    try {
      const saved = await booksRequest<Book>("/api/books", { method: "POST", body: input });
      setBooks((list) => [saved, ...list.filter((book) => book.id !== saved.id)]);
      return saved;
    } catch (error) {
      // Already there: added on another device since these were loaded.
      if ((error as ApiError).status === 409) void client.invalidateQueries({ queryKey: booksKey });
      throw error;
    }
  }

  function remove(book: Book) {
    setChangeError("");
    undo.schedule({
      id: book.id,
      label: `Removed “${book.title}”`,
      commit: () =>
        void send(book.id, "DELETE").then(
          () => setBooks((list) => list.filter((entry) => entry.id !== book.id)),
          failed,
        ),
    });
  }

  const value: Shelves = {
    books,
    loadError: query.data === undefined && query.error ? query.error.message : "",
    reload: () => void query.refetch(),
    byId: (id) => books?.find((book) => book.id === id),
    byCatalogId: (catalogId) => (catalogId ? books?.find((book) => book.catalogId === catalogId) : undefined),
    add,
    change,
    remove,
    changeError,
    dismissError: () => setChangeError(""),
    undo,
  };
  return <ShelvesContext value={value}>{children}</ShelvesContext>;
}

export function useShelves(): Shelves {
  const shelves = useContext(ShelvesContext);
  if (!shelves) throw new Error("useShelves needs a ShelvesProvider");
  return shelves;
}

/** What a refused change was, with × to dismiss it. */
export function ChangeError({ className = "" }: { className?: string }) {
  const { changeError, dismissError } = useShelves();
  if (!changeError) return null;
  return (
    <Alert className={className} onDismiss={dismissError}>
      {changeError}
    </Alert>
  );
}

/** A catalogue book as a new book on `shelf`: none of it read yet (all of it, finished). */
export const catalogInput = (book: CatalogBook, shelf: Shelf): BookInput =>
  normalizeProgress({ ...book, pagesRead: 0, shelf });

/** A Discover list (up to 12 books), kept for an hour. */
export function useBookList(list: BookList, enabled = true) {
  return useQuery({
    queryKey: ["book-discover", list],
    queryFn: ({ signal }) => booksRequest<CatalogBook[]>(`/api/books/discover?list=${list}`, { signal }),
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

/** Open Library's books for a search of at least 2 characters (nothing for a shorter one). */
export function useBookSearch(text: string) {
  return useQuery({
    queryKey: ["book-search", text],
    queryFn: ({ signal }) => booksRequest<CatalogBook[]>(`/api/books/search?q=${encodeURIComponent(text)}`, { signal }),
    enabled: text.length >= 2,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

/** A catalogue book's page (its description and more), for its panel. */
export function useCatalogBook(catalogId: string | null) {
  return useQuery({
    queryKey: ["book-work", catalogId],
    queryFn: ({ signal }) => booksRequest<CatalogBookDetail>(`/api/books/works/${catalogId}`, { signal }),
    enabled: catalogId !== null,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}

// The catalogue's books as their cards showed them, so a book's panel shows
// that while it loads the rest.
const seen = new Map<string, CatalogBook>();
export const seenCatalogBook = (catalogId: string) => seen.get(catalogId);

/**
 * Opens a book's panel: "book:<id>" for one on the shelves, "work:OL…W" for
 * one from the catalogue (Discover, search), which shows it as on the shelves
 * once it is.
 */
export function useOpenBook() {
  const { openPanel } = useAppView();
  return (book: Book | CatalogBook) => {
    if ("id" in book) return openPanel(`book:${book.id}`);
    if (book.catalogId) {
      seen.set(book.catalogId, book);
      openPanel(`work:${book.catalogId}`);
    }
  };
}
