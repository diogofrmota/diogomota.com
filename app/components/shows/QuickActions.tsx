"use client";
import ui from "@/components/common/ui.module.css";
import { useId, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { useAppView } from "@/hooks/useAppView";
import { progressOf, titleKey, type MediaType, type TitleSummary } from "@/lib/show-types";
import { EpisodePicker } from "./EpisodePicker";
import { ChangeError, useLibrary } from "./library";
import { StatusPicker } from "./LibraryControls";
import { LoadError } from "./TitleGrid";
import styles from "./Shows.module.css";

type Anchor = Pick<DOMRect, "left" | "right" | "top" | "bottom">;
// Where each menu was opened from: the ⋯ button, or the point of a right click
// or long press. A menu reopened with forward has none and is centered.
const anchors = new Map<string, Anchor>();

/** Opens a library title's quick actions (panel id "actions:tv:123") next to `anchor`. */
export function useOpenActions() {
  const { openPanel } = useAppView();
  return (title: Pick<TitleSummary, "type" | "tmdbId">, anchor: Anchor) => {
    anchors.set(titleKey(title), anchor);
    openPanel(`actions:${titleKey(title)}`);
  };
}

// On a wide screen, the menu opens beside its anchor, towards the side with the
// most room; on a phone it is a sheet from the bottom (Shows.module.css).
function placement(anchor: Anchor | undefined): React.CSSProperties | undefined {
  if (!anchor || !window.matchMedia("(min-width: 48rem)").matches) return undefined;
  const { innerWidth: width, innerHeight: height } = window;
  const gap = 4;
  const below = anchor.bottom < height * 0.6;
  return {
    ...((anchor.left + anchor.right) / 2 < width / 2 ? { left: anchor.left } : { right: width - anchor.right }),
    ...(below
      ? { top: anchor.bottom + gap, maxHeight: height - anchor.bottom - 3 * gap }
      : { bottom: height - anchor.top + gap, maxHeight: anchor.top - 3 * gap }),
  };
}

/**
 * Quick status change of a title in the library, from its card (the Watchlist,
 * Profile, a tick on a Discover poster): with the season and the episode of a
 * TV show being watched.
 */
export function QuickActions({ title }: { title: { type: MediaType; tmdbId: number } }) {
  const { closePanel } = useAppView();
  const library = useLibrary();
  const headingId = useId();
  const item = library.find(title);
  const [style] = useState(() => placement(anchors.get(titleKey(title))));
  return (
    <Dialog
      className={`${styles.dialog} ${styles.menuDialog} ${style ? styles.anchored : ""}`}
      style={style}
      aria-labelledby={headingId}
      onClose={closePanel}
    >
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2 id={headingId}>{item?.title ?? (library.items ? "Not in your library" : "Quick actions")}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={closePanel}>
            <CloseIcon />
          </button>
        </div>
        <ChangeError className={styles.changeError} />
        {item ? (
          <>
            <StatusPicker status={item.library.status} onChange={(status) => library.change(item, { status })} />
            {item.type === "tv" && item.library.status === "watching" && !!item.episodesPerSeason?.length && (
              <EpisodePicker
                seasons={item.episodesPerSeason}
                progress={progressOf(item.library)}
                onChange={(progress) =>
                  library.change(item, {
                    currentSeason: progress?.season ?? null,
                    currentEpisode: progress?.episode ?? null,
                  })
                }
              />
            )}
          </>
        ) : library.items ? (
          <p className={ui.muted}>This title isn&rsquo;t in your library anymore.</p>
        ) : library.loadError ? (
          <LoadError message={library.loadError} onRetry={library.reload} />
        ) : (
          <Spinner label="Loading your library…" />
        )}
      </div>
    </Dialog>
  );
}
