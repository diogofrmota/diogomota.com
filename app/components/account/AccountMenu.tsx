"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { logOut } from "@/app/account/actions";
import { AppsIcon, ChevronDownIcon, LogoutIcon, UserIcon } from "@/components/common/icons";
import styles from "./AccountMenu.module.css";

// The username in the top bar, drawn as a button (a pill with the username's
// initial, the username and a chevron that turns over when open; on a phone
// only the initial, as a round avatar), opening
// Account (/account), Switch app (/apps, the way from one app to another; not
// on /apps itself) and Logout, each with its icon. A disclosure (a button that
// shows a list) rather than an ARIA menu, so Tab moves through it like any
// links. Escape, a click outside or tabbing away closes it.
export function AccountMenu({ username, switchApp }: {
  username: string;
  /** Whether to offer Switch app: everywhere but /apps, where the apps already are. */
  switchApp: boolean;
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
      {/* Named by the username alone: the initial and the chevron are hidden. */}
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.pill}>
          <span aria-hidden="true" className={styles.avatar}>
            {username.charAt(0).toUpperCase()}
          </span>
          <span className={styles.name}>{username}</span>
          <span className={styles.chevron}>
            <ChevronDownIcon />
          </span>
        </span>
      </button>
      <div id={listId} className={styles.list} hidden={!open}>
        {/* On a phone the button shows only the initial: the username, at the top. */}
        <p className={styles.who}>
          <span aria-hidden="true" className={styles.avatar}>
            {username.charAt(0).toUpperCase()}
          </span>
          <span className={styles.whoName}>{username}</span>
        </p>
        <ul className={styles.items}>
          <li>
            <Link href="/account" className={styles.item} onClick={() => setOpen(false)}>
              <UserIcon />
              Account
            </Link>
          </li>
          {switchApp && (
            <li>
              <Link href="/apps" className={styles.item} onClick={() => setOpen(false)}>
                <AppsIcon />
                Switch app
              </Link>
            </li>
          )}
          <li className={styles.separated}>
            <form action={logOut}>
              <button type="submit" className={styles.item}>
                <LogoutIcon />
                Logout
              </button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
