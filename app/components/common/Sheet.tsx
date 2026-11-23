"use client";
import { useId } from "react";
import { Dialog } from "./Dialog";
import { CloseIcon } from "./icons";

export type SheetProps = {
  title: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
};

/** Shared sheet markup; the caller's CSS module preserves its layout and sizes. */
export function Sheet({
  title,
  onClose,
  wide = false,
  children,
  styles,
}: SheetProps & { styles: Readonly<Record<string, string>> }) {
  const heading = useId();
  return (
    <Dialog className={`${styles.dialog} ${wide ? styles.wide : ""}`} aria-labelledby={heading} onClose={onClose}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2 id={heading}>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </Dialog>
  );
}
