"use client";
import ui from "@/components/common/ui.module.css";
import { useId } from "react";
import { formatHours, type LibraryStats } from "@/lib/show-types";
import styles from "./Shows.module.css";

/** A library's stats: hours watched and titles completed. */
export function StatsSection({ stats }: { stats: LibraryStats | null }) {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id} aria-busy={!stats}>
      <h2 id={id}>Stats</h2>
      {!stats ? (
        <>
          <p role="status" className={ui.srOnly}>
            Loading stats…
          </p>
          <div className={styles.stats} aria-hidden="true">
            {[1, 2, 3].map((tile) => (
              <span key={tile} className={`${styles.statSkeleton} ${styles.skeleton}`} />
            ))}
          </div>
        </>
      ) : (
        <dl className={styles.stats}>
          <div>
            <dt>Hours watched</dt>
            <dd>{formatHours(stats.minutesWatched)}</dd>
          </div>
          <div>
            <dt>TV shows completed</dt>
            <dd>{stats.tvCompleted.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Movies completed</dt>
            <dd>{stats.moviesCompleted.toLocaleString("en-GB")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
