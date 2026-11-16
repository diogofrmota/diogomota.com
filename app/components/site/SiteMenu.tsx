"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./SiteHeader.module.css";

/**
 * A button that opens a panel under it: the website header's Apps, and its
 * menu on a phone (SiteHeader). The panel is in the page, after the button, so
 * Tab goes from one into the other. Escape (back on the button), a press
 * outside, focus leaving it, or following one of its links closes it.
 */
export function SiteMenu({
  label,
  buttonLabel,
  className,
  panelClassName,
  children,
}: {
  /** What the button shows: its name, an icon, or both. */
  label: React.ReactNode;
  /** The button's name, when it shows only an icon. */
  buttonLabel?: string;
  className: string;
  panelClassName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={styles.menu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      <div
        id={id}
        className={panelClassName}
        hidden={!open}
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
