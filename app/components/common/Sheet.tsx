"use client";
import { useId } from "react";
import { Dialog } from "./Dialog";
import { CloseIcon } from "./icons";
import sheet from "./Sheet.module.css";

export type SheetProps = {
  title: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
};

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * Shared sheet markup and styles (Sheet.module.css); the caller's CSS module
 * adds its own to them: dialog, wide, dialogBody and dialogHeader.
 */
export function Sheet({
  title,
  onClose,
  wide = false,
  children,
  styles,
}: SheetProps & { styles: Readonly<Record<string, string | undefined>> }) {
  const heading = useId();
  return (
    <Dialog
      className={classes(sheet.dialog, styles.dialog, wide && styles.wide)}
      aria-labelledby={heading}
      onClose={onClose}
    >
      <div className={classes(sheet.body, styles.dialogBody)}>
        <div className={classes(sheet.header, styles.dialogHeader)}>
          <h2 id={heading}>{title}</h2>
          <button type="button" className={sheet.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </Dialog>
  );
}
