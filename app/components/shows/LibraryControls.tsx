"use client";
import { useId, useRef, useState } from "react";
import {
  formatEpisode, isLastEpisode, libraryStatuses, nextEpisode, progressOf, statusNames,
  type Episode, type LibraryItem, type LibraryStatus, type TitleDetail,
} from "@/lib/show-types";
import { ChangeError, useLibrary } from "./library";
import styles from "./Shows.module.css";

/** Watching | Planned | Completed, the current one pressed. */
export function StatusPicker({ status, onChange }: { status: LibraryStatus; onChange: (status: LibraryStatus) => void }) {
  return <div className={styles.statusPicker} role="group" aria-label="Status">
    {libraryStatuses.map((s) => <button key={s} type="button" aria-pressed={s === status}
      onClick={() => { if (s !== status) onChange(s); }}>{statusNames[s]}</button>)}
  </div>;
}

/** 1-5 stars. Pressing the current rating again, or Clear, removes it. */
export function StarRating({ rating, onChange }: { rating: number | null; onChange: (rating: number | null) => void }) {
  const id = useId();
  return <div className={styles.rating} role="group" aria-labelledby={id}>
    <span id={id} className={styles.label}>Your rating</span>
    <span className={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={styles.star} data-filled={rating !== null && n <= rating}
        aria-pressed={n === rating} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => onChange(n === rating ? null : n)}>★</button>)}
    </span>
    {rating !== null && <button type="button" className={styles.textButton} aria-label="Clear rating" onClick={() => onChange(null)}>Clear</button>}
  </div>;
}

// A TV show's progress: the last episode watched, chosen with a season and an
// episode picker or moved on with Next episode. Reaching the last episode
// offers to mark the show completed.
function Progress({ item, seasons }: { item: LibraryItem; seasons: readonly number[] }) {
  const { change } = useLibrary();
  const id = useId();
  const seasonId = useId();
  const episodeId = useId();
  const offerId = useId();
  const [notYet, setNotYet] = useState(false);
  const progress = progressOf(item.library);
  const next = nextEpisode(seasons, progress);
  const set = (episode: Episode | null) => {
    setNotYet(false);
    change(item, { currentSeason: episode?.season ?? null, currentEpisode: episode?.episode ?? null });
  };
  if (!seasons.length) return <p className={styles.muted}>TMDB lists no episodes of this show yet.</p>;

  // Kept selectable if TMDB has since listed fewer seasons or episodes.
  const seasonCount = Math.max(seasons.length, progress?.season ?? 0);
  const episodeCount = progress ? Math.max(seasons[progress.season - 1] ?? 0, progress.episode) : 0;
  return <div className={styles.progress} role="group" aria-labelledby={id}>
    <p className={styles.progressHeader}>
      <span id={id} className={styles.label}>Progress</span>
      <span className={styles.progressValue}>{progress ? formatEpisode(progress) : "Not started"}</span>
    </p>
    <div className={styles.pickers}>
      <span>
        <label htmlFor={seasonId}>Season</label>
        <select id={seasonId} value={progress?.season ?? ""}
          onChange={(e) => set(e.target.value ? { season: Number(e.target.value), episode: 1 } : null)}>
          <option value="">Not started</option>
          {Array.from({ length: seasonCount }, (_, i) => <option key={i} value={i + 1} disabled={!seasons[i]}>Season {i + 1}</option>)}
        </select>
      </span>
      <span>
        <label htmlFor={episodeId}>Episode</label>
        <select id={episodeId} value={progress?.episode ?? ""} disabled={!progress}
          onChange={(e) => set({ season: progress!.season, episode: Number(e.target.value) })}>
          {!progress && <option value="">–</option>}
          {Array.from({ length: episodeCount }, (_, i) => <option key={i} value={i + 1}>Episode {i + 1}</option>)}
        </select>
      </span>
    </div>
    {next && <button type="button" className={`${styles.primary} ${styles.nextEpisode}`} onClick={() => set(next)}>
      Next episode <span>{formatEpisode(next)}</span>
    </button>}
    {progress && isLastEpisode(seasons, progress) && !notYet && <div className={styles.offer} role="group" aria-labelledby={offerId}>
      <p id={offerId} role="status">That&rsquo;s the last episode. Mark {item.title} as completed?</p>
      <div className={styles.offerButtons}>
        <button type="button" className={styles.primary} onClick={() => change(item, { status: "completed" })}>Mark as completed</button>
        <button type="button" onClick={() => setNotYet(true)}>Not yet</button>
      </div>
    </div>}
  </div>;
}

/** The detail panel's controls for a title in the library. */
export function LibraryControls({ item, detail, onRemoved }: { item: LibraryItem; detail: TitleDetail; onRemoved: () => void }) {
  const { change, remove } = useLibrary();
  const confirmId = useId();
  const removeButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const entry = item.library;
  return <section className={styles.library} aria-label="Your library">
    <div className={styles.libraryHeader}>
      <p role="status" className={styles.inLibrary}>✓ In your library</p>
      <button type="button" className={styles.favourite} aria-pressed={entry.isFavourite}
        onClick={() => change(item, { isFavourite: !entry.isFavourite })}>
        <span aria-hidden="true">{entry.isFavourite ? "♥" : "♡"}</span> Favourite
      </button>
    </div>
    <ChangeError className={styles.error} />
    <StatusPicker status={entry.status} onChange={(status) => change(item, { status })} />
    {detail.type === "tv" && entry.status === "watching" && <Progress item={item} seasons={detail.episodesPerSeason ?? []} />}
    <StarRating rating={entry.rating} onChange={(rating) => change(item, { rating })} />
    <button ref={removeButton} type="button" className={styles.remove} aria-expanded={confirming}
      onClick={() => setConfirming(!confirming)}>Remove from library</button>
    {confirming && <div className={styles.confirm} role="group" aria-labelledby={confirmId}>
      <p id={confirmId}>Remove {item.title} from your library? Its progress and rating go with it.</p>
      <div className={styles.offerButtons}>
        <button type="button" className={styles.danger} onClick={() => { remove(item); onRemoved(); }}>Remove</button>
        <button type="button" onClick={() => { setConfirming(false); removeButton.current?.focus(); }}>Cancel</button>
      </div>
    </div>}
  </section>;
}
