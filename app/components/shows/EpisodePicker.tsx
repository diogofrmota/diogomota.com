"use client";
import { useId } from "react";
import type { Episode } from "@/lib/show-types";
import styles from "./Shows.module.css";

/**
 * A TV show's progress as two selects: the season (Not started first) and the
 * episode in it, the last one watched. Choosing a season starts it at its first
 * episode. Seasons and episodes past what TMDB now lists stay choosable while
 * they are the progress. With `labelled`, each has its label over it (the
 * detail panel, quick actions); without, they are named for screen readers
 * only (over a poster).
 */
export function EpisodePicker({
  seasons,
  progress,
  onChange,
  labelled = true,
  firstRef,
}: {
  /** Episodes in each season, season 1 first. */
  seasons: readonly number[];
  progress: Episode | null;
  onChange: (progress: Episode | null) => void;
  labelled?: boolean;
  /** The season select, to focus it. */
  firstRef?: React.Ref<HTMLSelectElement>;
}) {
  const seasonId = useId();
  const episodeId = useId();
  const seasonCount = Math.max(seasons.length, progress?.season ?? 0);
  const episodeCount = progress ? Math.max(seasons[progress.season - 1] ?? 0, progress.episode) : 0;
  const season = (
    <select
      ref={firstRef}
      id={seasonId}
      aria-label={labelled ? undefined : "Season"}
      value={progress?.season ?? ""}
      onChange={(e) => onChange(e.target.value ? { season: Number(e.target.value), episode: 1 } : null)}
    >
      <option value="">Not started</option>
      {Array.from({ length: seasonCount }, (_, i) => (
        <option key={i} value={i + 1} disabled={!seasons[i]}>
          Season {i + 1}
        </option>
      ))}
    </select>
  );
  const episode = (
    <select
      id={episodeId}
      aria-label={labelled ? undefined : "Episode"}
      value={progress?.episode ?? ""}
      disabled={!progress}
      onChange={(e) => onChange({ season: progress!.season, episode: Number(e.target.value) })}
    >
      {!progress && <option value="">–</option>}
      {Array.from({ length: episodeCount }, (_, i) => (
        <option key={i} value={i + 1}>
          Episode {i + 1}
        </option>
      ))}
    </select>
  );
  if (!labelled)
    return (
      <>
        {season}
        {episode}
      </>
    );
  return (
    <div className={styles.pickers}>
      <span>
        <label htmlFor={seasonId}>Season</label>
        {season}
      </span>
      <span>
        <label htmlFor={episodeId}>Episode</label>
        {episode}
      </span>
    </div>
  );
}
