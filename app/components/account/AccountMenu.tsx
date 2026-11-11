"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logOut } from "@/app/account/actions";
import { AppsIcon, ChevronDownIcon, LogoutIcon, UserIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import { LogoutButton } from "./LogoutButton";
import styles from "./AccountMenu.module.css";

// The username in the top bar, drawn as a button (a pill with the username's
// initial, the username and a chevron that turns over when open; on a phone
// only the initial, as a round avatar), opening
// Account (/account), Switch app (/apps, the way from one app to another; not
// on /apps itself) and Log out, each with its icon. A disclosure (a button that
// shows a list) rather than an ARIA menu, so Tab moves through it like any
// links. Escape, a click outside or tabbing away closes it. A chosen item
// keeps it open, with a spinner in place of its icon, until the page it opens
// is there (and the menu with it, closed); the current page's closes it at once.
export function AccountMenu({ username, switchApp }: {
  username: string;
  /** Whether to offer Switch app: everywhere but /apps, where the apps already are. */
  switchApp: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const pathname = usePathname();
  // The page it was opened on: it shows only there, so once a chosen item's
  // page is there, it is closed, whether or not the top bar is a new one.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const closeIfHere = (href: string) => { if (href === pathname) setOpen(false); };

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenOn(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOn(null);
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
        onClick={() => setOpen(!open)}
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
            <Link href="/account" className={styles.item} onClick={() => closeIfHere("/account")}>
              <LinkPending icon={<UserIcon />} />
              Account
            </Link>
          </li>
          {switchApp && (
            <li>
              <Link href="/apps" className={styles.item} onClick={() => closeIfHere("/apps")}>
                <LinkPending icon={<AppsIcon />} />
                Switch app
              </Link>
            </li>
          )}
          <li className={styles.separated}>
            <form action={logOut}>
              <LogoutButton className={styles.item} icon={<LogoutIcon />} />
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
