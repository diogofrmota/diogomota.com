"use client";
import { useId, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { placement } from "@/components/shows/QuickActions";
import shows from "@/components/shows/Shows.module.css";
import { useAppView } from "@/hooks/useAppView";
import { actionsAnchor } from "./BookCards";
import { PagesForm } from "./BookDialog";
import { ChangeError, useShelves } from "./books-data";
import { ShelfPicker } from "./BookParts";
import styles from "./Books.module.css";

/**
 * A book's quick actions (panel "actions:<id>"), from its card's ⋯, a long
 * press or a right click, or a catalogue card's tick: its shelf, and the pages
 * read of one being read. Beside where it was opened on a wide screen, as
 * Shows' quick actions.
 */
export function BookActions({ id }: { id: string }) {
  const { closePanel } = useAppView();
  const { books, byId, change, loadError, reload } = useShelves();
  const headingId = useId();
  const book = byId(id);
  const [anchor] = useState(() => actionsAnchor(id));
  const [style] = useState(() => placement(anchor));
  return (
    <Dialog
      className={`${shows.dialog} ${shows.menuDialog} ${styles.menu} ${style ? shows.anchored : ""}`}
      style={style}
      kind="menu"
      origin={
        anchor && {
          left: anchor.left,
          top: anchor.top,
          width: anchor.right - anchor.left,
          height: anchor.bottom - anchor.top,
        }
      }
      aria-labelledby={headingId}
      onClose={closePanel}
    >
      <div className={shows.dialogBody}>
        <div className={shows.dialogHeader}>
          <h2 id={headingId}>{book?.title ?? (books ? "Not on your shelves" : "Quick actions")}</h2>
          <button type="button" className={shows.close} aria-label="Close" onClick={closePanel}>
            <CloseIcon />
          </button>
        </div>
        <ChangeError className={shows.changeError} />
        {book ? (
          <>
            <ShelfPicker shelf={book.shelf} onChange={(shelf) => change(book, { shelf })} />
            {book.shelf === "currently-reading" && <PagesForm key={book.pagesRead} book={book} />}
          </>
        ) : books ? (
          <p className={ui.muted}>This book isn&rsquo;t on your shelves anymore.</p>
        ) : loadError ? (
          <Alert onRetry={reload}>{loadError}</Alert>
        ) : (
          <Spinner label="Loading your books…" />
        )}
      </div>
    </Dialog>
  );
}
