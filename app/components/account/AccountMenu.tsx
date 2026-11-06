"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { logOut } from "@/app/account/actions";
import styles from "./AccountMenu.module.css";

// The username in the top bar, opening Account (/account), Settings
// (/settings, every app's settings), Switch apps (/apps, the way from one app
// to another) and Logout. A disclosure (a button that shows a list) rather than
// an ARIA menu, so Tab moves through it like any links. Escape, a click outside
// or tabbing away closes it.
export function AccountMenu({ username, settingsHref }: {
  username: string;
  /** Settings, open on the app the menu is in (lib/apps.ts, settingsHref). */
  settingsHref: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.name}>{username}</span>
        <span aria-hidden="true" className={styles.caret}>
          ▾
        </span>
      </button>
      <ul id={listId} className={styles.list} hidden={!open}>
        <li>
          <Link href="/account" className={styles.item} onClick={() => setOpen(false)}>
            Account
          </Link>
        </li>
        <li>
          <Link href={settingsHref} className={styles.item} onClick={() => setOpen(false)}>
            Settings
          </Link>
        </li>
        <li>
          <Link href="/apps" className={styles.item} onClick={() => setOpen(false)}>
            Switch apps
          </Link>
        </li>
        <li>
          <form action={logOut}>
            <button type="submit" className={styles.item}>
              Logout
            </button>
          </form>
        </li>
      </ul>
    </div>
  );
}
