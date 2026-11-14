"use client";

import Link from "next/link";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import type { Theme } from "@/lib/themes";
import styles from "./MessagePage.module.css";

/** Who is logged in, for the page's tab bar (Account and Home), or null. */
export type MessagePageUser = { username: string; name: string | null; avatarUrl: string | null } | null;

// A heading, one line of text and a way on (Retry first, when given), in the
// apps' frame and look: the 404 page, in the user's theme with the tab bar,
// and the error page, in the default theme without one (`bare`: the server
// that failed can't say who is logged in).
export function MessagePage({
  title,
  message,
  link,
  onRetry,
  theme,
  user = null,
  bare = false,
}: {
  title: string;
  message: string;
  link: { href: string; label: string };
  onRetry?: () => void;
  theme: Theme;
  user?: MessagePageUser;
  bare?: boolean;
}) {
  return (
    <AppFrame theme={theme} username={user?.username ?? null} name={user?.name} avatarUrl={user?.avatarUrl} bare={bare}>
      <div className={styles.column}>
        <h1 className={ui.heading}>{title}</h1>
        <p className={ui.muted}>{message}</p>
        <p className={styles.actions}>
          {onRetry && (
            <button type="button" className={ui.button} onClick={onRetry}>
              Retry
            </button>
          )}
          <Link href={link.href} className={`${ui.button} ${ui.primary}`}>
            {link.label}
          </Link>
        </p>
      </div>
    </AppFrame>
  );
}
