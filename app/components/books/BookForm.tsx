"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import shows from "@/components/shows/Shows.module.css";
import { useAppView } from "@/hooks/useAppView";
import { bookInput, normalizeProgress, type Shelf } from "@/lib/book-types";
import { useShelves } from "./books-data";
import { ShelfPicker } from "./BookParts";
import styles from "./Books.module.css";

/**
 * Add a book yourself (panel "new"), for one Open Library doesn't have: its
 * title, author, number of pages and shelf (and the pages read, on Reading).
 * Or Edit details (edit:<id>) of one on the shelves, over its panel: its
 * title, author and number of pages, which can differ from the catalogue's
 * by edition. Save checks them as the API does.
 */
type Field = "title" | "totalPages" | "pagesRead";

export function BookForm({ id }: { id?: string }) {
  const headingId = useId();
  const { closePanel } = useAppView();
  const { books, byId, add, change, loadError } = useShelves();
  const book = id ? byId(id) : undefined;
  const [shelf, setShelf] = useState<Shelf>("want-to-read");
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  function fail(message: string, field?: Field) {
    setError({ field, message });
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const number = (name: string) => (text(name) === "" ? null : Number(text(name)));
    const totalPages = number("totalPages");
    const reading = (book?.shelf ?? shelf) === "currently-reading";
    const pagesRead = book ? book.pagesRead : reading ? (number("pagesRead") ?? 0) : 0;
    if (totalPages !== null && (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 100000))
      return fail("Enter the number of pages, from 1 to 100,000, or leave it empty.", "totalPages");
    if (reading && totalPages !== null && pagesRead > totalPages)
      return book
        ? fail(`You’ve read ${book.pagesRead} pages of it: enter at least that many.`, "totalPages")
        : fail("Pages read can’t be more than its number of pages.", "pagesRead");
    const parsed = bookInput.safeParse(
      normalizeProgress({
        title: text("title"),
        author: text("author"),
        totalPages,
        pagesRead,
        shelf: book?.shelf ?? shelf,
        catalogId: book?.catalogId ?? null,
        coverId: book?.coverId ?? null,
      }),
    );
    if (!parsed.success) {
      const field = parsed.error.issues[0].path[0];
      return field === "title"
        ? fail(parsed.error.issues[0].message, "title")
        : fail("Enter how many pages you’ve read.", "pagesRead");
    }
    setError(null);
    if (book) {
      change(book, parsed.data);
      closePanel();
      return;
    }
    setSaving(true);
    try {
      await add(parsed.data);
      closePanel();
    } catch (err) {
      setError({ message: (err as Error).message });
      setSaving(false);
    }
  }

  const invalid = (field: Field) => (error?.field === field ? true : undefined);

  return (
    <Dialog className={`${shows.dialog} ${styles.formDialog}`} aria-labelledby={headingId} onClose={closePanel}>
      <div className={shows.dialogBody}>
        <div className={shows.dialogHeader}>
          <h2 id={headingId}>
            {!id ? "Add a book" : !book && (books || loadError) ? "Book not found" : "Edit details"}
          </h2>
          <button type="button" className={shows.close} aria-label="Close" onClick={closePanel}>
            <CloseIcon />
          </button>
        </div>
        {id && !book ? (
          books || loadError ? (
            <p className={ui.muted}>{loadError || "It isn’t on your shelves anymore, on this device or another."}</p>
          ) : (
            <Spinner label="Loading your books…" />
          )
        ) : (
          <form ref={form} className={styles.form} onSubmit={(e) => void save(e)} noValidate>
            {error && <Alert>{error.message}</Alert>}
            <label>
              Title
              <input
                name="title"
                required
                maxLength={300}
                defaultValue={book?.title}
                autoComplete="off"
                data-autofocus
                aria-invalid={invalid("title")}
              />
            </label>
            <label>
              Author
              <input name="author" maxLength={500} defaultValue={book?.author} autoComplete="off" />
            </label>
            <label>
              Number of pages
              <span className={styles.hint}>
                {book?.catalogId ? "Editions differ: the number in your copy." : "Optional, to see how far you are."}
              </span>
              <input
                name="totalPages"
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                step={1}
                defaultValue={book?.totalPages ?? undefined}
                aria-invalid={invalid("totalPages")}
              />
            </label>
            {!book && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Shelf</span>
                <ShelfPicker shelf={shelf} onChange={setShelf} />
              </div>
            )}
            {!book && shelf === "currently-reading" && (
              <label>
                Pages read
                <input
                  name="pagesRead"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100000}
                  step={1}
                  defaultValue={0}
                  aria-invalid={invalid("pagesRead")}
                />
              </label>
            )}
            {/* No Cancel: the × at the top closes it without saving. */}
            <div className={ui.actions}>
              <Button variant="primary" type="submit" busy={saving}>
                Save
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
