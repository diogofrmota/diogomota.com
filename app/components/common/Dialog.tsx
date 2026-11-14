"use client";
import { useEffect, useRef } from "react";
import styles from "./Dialog.module.css";

/**
 * Whether a popup can start with its text field focused: with a mouse, yes; on
 * a touch screen, no, since the keyboard would come up over the popup before
 * it's seen (the field is a tap away). False on the server.
 */
export function typesFirst(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

// The apps' modals and panels: a modal <dialog> that is open while it is mounted,
// shown for a useAppView panel. Escape, a click on the backdrop and Back close it
// (onClose goes back in history); closing hands focus back to where it was.
// Focus starts on the element marked data-autofocus, if any (a text field only
// where typesFirst), else on the first focusable one (showModal ignores React's
// autoFocus). Dialogs can stack, and the page behind doesn't scroll while one is
// open (AppShell.module.css).
export function Dialog({
  className,
  style,
  onClose,
  children,
  ...labelling
}: {
  className: string;
  style?: React.CSSProperties;
  onClose: () => void;
  children: React.ReactNode;
} & ({ "aria-labelledby": string } | { "aria-label": string })) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a click that also started on the backdrop closes it: lifting the
  // finger of the long press that opened it lands there too.
  const pressedBackdrop = useRef(false);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const first = dialog.querySelector<HTMLElement>("[data-autofocus]");
    if (first && (typesFirst() || !first.matches("input, textarea"))) first.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  // The content fills the dialog, so only a click on the backdrop lands on the dialog itself.
  return (
    <dialog
      ref={ref}
      className={`${className} ${styles.popup}`}
      style={style}
      {...labelling}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
