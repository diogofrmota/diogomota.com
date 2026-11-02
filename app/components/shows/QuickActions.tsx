"use client";
import { useId, useState } from "react";
import { useAppView } from "@/hooks/useAppView";
import { titleKey, type MediaType, type TitleSummary } from "@/lib/show-types";
import { Dialog } from "./Dialog";
import { ChangeError, useLibrary } from "./library";
import { StarRating, StatusPicker } from "./LibraryControls";
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
    ...(below ? { top: anchor.bottom + gap, maxHeight: height - anchor.bottom - 3 * gap }
      : { bottom: height - anchor.top + gap, maxHeight: anchor.top - 3 * gap }),
  };
}

/** Quick status change and rating of a title in the library, from its card on Home. */
export function QuickActions({ title }: { title: { type: MediaType; tmdbId: number } }) {
  const { closePanel } = useAppView();
  const library = useLibrary();
  const headingId = useId();
  const item = library.find(title);
  const [style] = useState(() => placement(anchors.get(titleKey(title))));
  return <Dialog className={`${styles.dialog} ${styles.menuDialog} ${style ? styles.anchored : ""}`} style={style}
    aria-labelledby={headingId} onClose={closePanel}>
    <div className={styles.dialogBody}>
      <div className={styles.dialogHeader}>
        <h2 id={headingId}>{item?.title ?? "Not in your library"}</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={closePanel}>×</button>
      </div>
      <ChangeError className={styles.error} />
      {item ? <>
        <StatusPicker status={item.library.status} onChange={(status) => library.change(item, { status })} />
        <StarRating rating={item.library.rating} onChange={(rating) => library.change(item, { rating })} />
      </> : <p className={styles.muted}>{library.items ? "This title isn't in your library anymore." : "Loading your library…"}</p>}
    </div>
  </Dialog>;
}
