"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useSyncExternalStore, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon, LockIcon, SettingsIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import { CouplesWelcome } from "@/components/shared/CouplesWelcome";
import { useAppViewHistory } from "@/hooks/useAppView";
import { homeViews, type AppViewState } from "@/lib/app-views";
import type { AppFolder } from "@/lib/apps";
import { AppGrid, badgeText, type GridApp } from "./AppGrid";
import grid from "./AppGrid.module.css";
import styles from "./AppFolders.module.css";

/** A folder on /, logged in: its apps with what is waiting in each, and all of that added up. */
export type HomeFolder = Pick<AppFolder, "id" | "title" | "private"> & {
  apps: readonly GridApp[];
  /** What is waiting in its apps, together. */
  badge: number;
};

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });
const privateNote = "Private: only you and your partner see them.";
const subscribeNever = () => () => {};

/**
 * The folders on /, logged in, under the profile (docs/decisions/0023): For
 * Couples, Trackers and Health in a row, each like a phone's folder, a tile of
 * its apps' small icons with its name under it, and what is waiting in them
 * on its corner. For Couples, the apps of the user's group, has a lock in its
 * corner (the count beside it). A folder opens in a popup, growing out of its
 * tile: its apps, each going into its app; For Couples' with the way to the
 * group's settings, or before there is a group, creating or joining one.
 *
 * The folder open is in the URL (/?p=folder:couples, hooks/useAppView.ts), so
 * Back closes it, a reload keeps it and a link opens it (an invite, once
 * joined: app/join/[code]/actions.ts).
 */
export function AppFolders({
  folders,
  inGroup,
  initial,
}: {
  folders: readonly HomeFolder[];
  inGroup: boolean;
  initial: AppViewState;
}) {
  const { panels, openPanel, closePanel } = useAppViewHistory("/", homeViews, initial);
  // Rendered by the server: a folder can't open until the page is hydrated, so it waits (as Account's settings do).
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const id = useId();
  const top = panels.at(-1);
  const open = top?.startsWith("folder:") ? folders.find((folder) => folder.id === top.slice(7)) : undefined;
  return (
    <>
      <ul className={styles.folders}>
        {folders.map((folder, i) => (
          <li key={folder.id} style={{ "--i": i } as React.CSSProperties}>
            <button
              type="button"
              className={styles.folder}
              aria-haspopup="dialog"
              aria-expanded={open?.id === folder.id}
              // With a count, it is read out with the name: "For Couples, 3 waiting".
              aria-label={folder.badge > 0 ? `${folder.title}, ${folder.badge} waiting` : undefined}
              aria-describedby={`${id}-${folder.id}`}
              disabled={!hydrated}
              onClick={() => openPanel(`folder:${folder.id}`)}
            >
              <span className={styles.tile}>
                <span className={styles.minis}>
                  {folder.apps.slice(0, 4).map(({ app }) => (
                    <Image key={app.href} unoptimized src={app.logo} alt="" width={40} height={40} />
                  ))}
                </span>
                {folder.private && (
                  <span className={styles.lock} aria-hidden="true">
                    <LockIcon />
                  </span>
                )}
                {folder.badge > 0 && (
                  <span
                    className={`${grid.badge} ${styles.badge} ${folder.private ? styles.besideLock : ""}`}
                    aria-hidden="true"
                  >
                    {badgeText(folder.badge)}
                  </span>
                )}
              </span>
              <span className={styles.name}>{folder.title}</span>
            </button>
            <span id={`${id}-${folder.id}`} hidden>
              {listFormat.format(folder.apps.map(({ app }) => app.name))}.{folder.private ? ` ${privateNote}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {open && <FolderPopup key={open.id} folder={open} inGroup={inGroup} onClose={closePanel} />}
    </>
  );
}

// An open folder, in the apps' popup (components/common/Dialog), grown out of
// its tile and back into it on closing (Escape, the backdrop, Close, Back).
function FolderPopup({ folder, inGroup, onClose }: { folder: HomeFolder; inGroup: boolean; onClose: () => void }) {
  const titleId = useId();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const welcome = folder.private && !inGroup;
  return (
    <Dialog className={styles.popup} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {folder.title}
          </h2>
          {folder.private && inGroup && (
            <Link href="/couples" className={styles.iconButton} aria-label="Group settings">
              <LinkPending icon={<SettingsIcon />} />
            </Link>
          )}
          <button type="button" className={styles.iconButton} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {folder.private && (
          <p className={styles.note}>
            <LockIcon />
            Private: only you and your partner see these apps.
          </p>
        )}
        {welcome ? (
          // Once in a group, home loads again (its badges, the group): the folder stays open, with its apps.
          <CouplesWelcome variant="popup" onJoined={() => startTransition(() => router.refresh())} busy={refreshing} />
        ) : (
          <AppGrid apps={folder.apps} className={styles.apps} />
        )}
      </div>
    </Dialog>
  );
}
