"use client";
import { useId } from "react";
import { formatHours, type LibraryStats } from "@/lib/show-types";
import styles from "./Shows.module.css";

const plural = (count: number, word: string) => `${count.toLocaleString("en-GB")} ${word}${count === 1 ? "" : "s"}`;

/** A library's stats: hours watched and titles completed. */
export function StatsSection({ stats }: { stats: LibraryStats | null }) {
  const id = useId();
  return <section className={styles.section} aria-labelledby={id} aria-busy={!stats}>
    <h2 id={id}>Stats</h2>
    {!stats ? <>
      <p role="status" className={styles.srOnly}>Loading stats…</p>
      <div className={styles.stats} aria-hidden="true">
        {[1, 2, 3].map((tile) => <span key={tile} className={`${styles.statSkeleton} ${styles.skeleton}`} />)}
      </div>
    </> : <>
      <dl className={styles.stats}>
        <div>
          <dt>Hours watched</dt>
          <dd>{formatHours(stats.minutesWatched)}</dd>
          <dd className={styles.statDetail}>{plural(stats.episodesWatched, "episode")} · {plural(stats.moviesCompleted, "movie")}</dd>
        </div>
        <div><dt>TV shows completed</dt><dd>{stats.tvCompleted.toLocaleString("en-GB")}</dd></div>
        <div><dt>Movies completed</dt><dd>{stats.moviesCompleted.toLocaleString("en-GB")}</dd></div>
      </dl>
      <p className={styles.statsNote}>
        A show being watched counts up to its current episode, a completed one in full; movies count once completed. Runtimes from TMDB.
      </p>
    </>}
  </section>;
}
