"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef } from "react";
import { leavingCopy, openPopup, releasePage, triggerOf, type Trigger } from "@/components/common/Dialog";
import { CloseIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import type { AppInfo } from "@/lib/apps";
import { authHref } from "@/lib/next-path";
import { AppPreview } from "./AppPreview";
import styles from "./LoginPrompt.module.css";

// Shown instead of an app while logged out, in the apps' dialog look: a picture
// of the app (as on its card), what it's for, then Log in and Sign up. A native
// modal <dialog>: it keeps focus inside, closes on Escape and hands focus back
// to the card on close. As the apps' popups: it grows in from the card that
// opened it, from 0.95, and leaves back into it, 20% quicker
// (components/common/Dialog: openPopup, leavingCopy).
export function LoginPrompt({ app, onClose }: { app: AppInfo | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<Trigger | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!app || !dialog || dialog.open) return;
    trigger.current = triggerOf(dialog, document.activeElement);
    openPopup(dialog, trigger.current);
  }, [app]);

  function dismiss() {
    const dialog = ref.current;
    if (!dialog?.open) return;
    const leaving = leavingCopy(dialog, trigger.current);
    dialog.close();
    releasePage();
    leaving?.play();
  }

  return (
    <dialog
      ref={ref}
      className={styles.prompt}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        // The content fills the dialog box, so a click that lands on the
        // dialog element itself was on the backdrop.
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      {app && (
        <div className={styles.content}>
          <AppPreview href={app.href} className={styles.preview} />
          <h2 id={titleId} className={`${ui.cardHeading} ${styles.title}`}>
            Log in to open {app.name}
          </h2>
          <p className={`${ui.muted} ${styles.text}`}>{app.description}</p>
          <div className={styles.actions}>
            {/* As everywhere: Log in plain and first, Sign up filled after it. */}
            <Link href={authHref("/login", app.href)} className={ui.button}>
              Log in
              <LinkPending />
            </Link>
            <Link href={authHref("/signup", app.href)} className={`${ui.button} ${ui.primary}`}>
              Sign up
              <LinkPending />
            </Link>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={dismiss}>
            <CloseIcon />
          </button>
        </div>
      )}
    </dialog>
  );
}
