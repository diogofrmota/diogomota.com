"use client";
import { useId, useRef, useState } from "react";
import { HeartIcon } from "@/components/common/icons";
import {
  formatEpisode, isLastEpisode, libraryStatuses, nextEpisode, progressOf, statusNames,
  type Episode, type LibraryItem, type LibraryStatus, type TitleDetail,
} from "@/lib/show-types";
import { statusIcons } from "./AddToLibrary";
import { EpisodePicker } from "./EpisodePicker";
import { ChangeError, useLibrary } from "./library";
import styles from "./Shows.module.css";

/** Planned | Watching | Completed, the current one pressed; with each one's icon in the detail panel. */
export function StatusPicker({ status, onChange, icons = false }: {
  status: LibraryStatus; onChange: (status: LibraryStatus) => void; icons?: boolean;
}) {
  return <div className={styles.statusPicker} role="group" aria-label="Status">
    {libraryStatuses.map((s) => {
      const Icon = statusIcons[s];
      return <button key={s} type="button" aria-pressed={s === status} data-status={s}
        onClick={() => { if (s !== status) onChange(s); }}>{icons && <Icon />}{statusNames[s]}</button>;
    })}
  </div>;
}

const sum = (counts: readonly number[]) => counts.reduce((total, count) => total + count, 0);

// A TV show's progress: the last episode watched, how far through the show
// that is (a bar, and the episodes in words), Next episode (what's done most
// often, so first), and a season and an episode picker to set it to any
// episode. Reaching the last episode offers to mark the show completed.
function Progress({ item, seasons }: { item: LibraryItem; seasons: readonly number[] }) {
  const { change } = useLibrary();
  const id = useId();
  const offerId = useId();
  const [notYet, setNotYet] = useState(false);
  const progress = progressOf(item.library);
  const next = nextEpisode(seasons, progress);
  const set = (episode: Episode | null) => {
    setNotYet(false);
    change(item, { currentSeason: episode?.season ?? null, currentEpisode: episode?.episode ?? null });
  };
  if (!seasons.length) return <p className={styles.muted}>TMDB lists no episodes of this show yet.</p>;

  const total = sum(seasons);
  const watched = progress ? Math.min(total, sum(seasons.slice(0, progress.season - 1)) + progress.episode) : 0;
  return <div className={styles.progress} role="group" aria-labelledby={id}>
    <div className={styles.progressHeader}>
      <span id={id} className={styles.label}>Progress</span>
      <span className={styles.progressValue}>{progress ? formatEpisode(progress) : "Not started"}</span>
    </div>
    <div className={styles.progressTrack} aria-hidden="true">
      <span style={{ width: `${total ? (watched / total) * 100 : 0}%` }} />
    </div>
    <p className={styles.progressNote}>{watched} of {total} episodes watched</p>
    {next && <button type="button" className={`${styles.primary} ${styles.nextEpisode}`} onClick={() => set(next)}>
      Next episode <span>{formatEpisode(next)}</span>
    </button>}
    <EpisodePicker seasons={seasons} progress={progress} onChange={set} />
    {progress && isLastEpisode(seasons, progress) && !notYet && <div className={styles.offer} role="group" aria-labelledby={offerId}>
      <p id={offerId} role="status">That&rsquo;s the last episode. Mark {item.title} as completed?</p>
      <div className={styles.offerButtons}>
        <button type="button" className={styles.primary} onClick={() => change(item, { status: "completed" })}>Mark as completed</button>
        <button type="button" onClick={() => setNotYet(true)}>Not yet</button>
      </div>
    </div>}
  </div>;
}

/**
 * The detail panel's controls for a title in the library, under its poster and
 * facts: the status (Planned | Watching | Completed, one over the other beside
 * the overview, in a row on a phone), then Favourite. That adding it worked is
 * said to screen readers; on screen, the status shows it.
 */
export function StatusControls({ item }: { item: LibraryItem }) {
  const { change } = useLibrary();
  const entry = item.library;
  return <section className={styles.libraryStatus} aria-label="Your library">
    <p role="status" className={styles.srOnly}>In your library</p>
    <ChangeError className={styles.error} />
    <StatusPicker icons status={entry.status} onChange={(status) => change(item, { status })} />
    <button type="button" className={styles.favourite} aria-pressed={entry.isFavourite}
      onClick={() => change(item, { isFavourite: !entry.isFavourite })}>
      <HeartIcon filled={entry.isFavourite} />Favourite
    </button>
  </section>;
}

/** A TV show being watched: its progress, in a panel of its own beside the status. */
export function LibraryProgress({ item, detail }: { item: LibraryItem; detail: TitleDetail }) {
  if (detail.type !== "tv" || item.library.status !== "watching") return null;
  return <div className={styles.library}><Progress item={item} seasons={detail.episodesPerSeason ?? []} /></div>;
}

/** Remove from library, which asks first; `onRemoved` once it's gone. */
export function RemoveFromLibrary({ item, onRemoved }: { item: LibraryItem; onRemoved: () => void }) {
  const { remove } = useLibrary();
  const confirmId = useId();
  const removeButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  return <div className={styles.removeArea}>
    <button ref={removeButton} type="button" className={styles.remove} aria-expanded={confirming}
      onClick={() => setConfirming(!confirming)}>Remove from library</button>
    {confirming && <div className={styles.confirm} role="group" aria-labelledby={confirmId}>
      <p id={confirmId}>Remove {item.title} from your library? Its progress goes with it.</p>
      <div className={styles.offerButtons}>
        <button type="button" className={styles.danger} onClick={() => { remove(item); onRemoved(); }}>Remove</button>
        <button type="button" onClick={() => { setConfirming(false); removeButton.current?.focus(); }}>Cancel</button>
      </div>
    </div>}
  </div>;
}
