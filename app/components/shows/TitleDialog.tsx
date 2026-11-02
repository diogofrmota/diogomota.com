"use client";
import { useId, useState } from "react";
import { addStatuses, formatRuntime, titleKey, type LibraryEntry, type LibraryStatus, type TitleDetail, type TitleSummary } from "@/lib/show-types";
import { Dialog } from "./Dialog";
import { seenTitle, ShowsRequestError, showsRequest, useShowsData } from "./shows-data";
import { LoadError, Poster, titleFacts } from "./TitleGrid";
import styles from "./Shows.module.css";

const statusNames: Record<LibraryStatus, string> = { watching: "Watching", planned: "Planned", completed: "Completed" };

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// "2 seasons · 18 episodes · 52 min episodes", or a movie's runtime.
function lengthFacts(detail: TitleDetail): string {
  if (detail.type === "movie") return detail.runtime ? formatRuntime(detail.runtime) : "";
  const seasons = detail.episodesPerSeason ?? [];
  const episodes = seasons.reduce((sum, count) => sum + count, 0);
  return [seasons.length > 0 && plural(seasons.length, "season"), episodes > 0 && plural(episodes, "episode"),
    detail.episodeRuntime && `${detail.episodeRuntime} min episodes`].filter(Boolean).join(" · ");
}

/** A title's detail panel (panel id "title:tv:123"), with Add to Library. */
export function TitleDialog({ title, onClose }: { title: Pick<TitleSummary, "type" | "tmdbId">; onClose: () => void }) {
  const headingId = useId();
  const addId = useId();
  const key = titleKey(title);
  const { data: detail, error, retry } = useShowsData<TitleDetail>(`/titles/${title.type}/${title.tmdbId}`, false);
  // Set once added here; until then the entry is the one loaded with the details.
  const [added, setAdded] = useState<LibraryEntry | null>(null);
  const [adding, setAdding] = useState<LibraryStatus | null>(null);
  const [addError, setAddError] = useState("");
  const shown: TitleSummary | undefined = detail ?? seenTitle(key);
  const entry = added ?? detail?.library ?? null;

  async function add(status: LibraryStatus) {
    setAdding(status); setAddError("");
    try {
      const result = await showsRequest<TitleDetail>("/library", { method: "POST", body: { type: title.type, tmdbId: title.tmdbId, status } });
      setAdded(result.library);
    } catch (err) {
      setAddError((err as Error).message);
      // Already there (added in another tab): load it again to show its status.
      if (err instanceof ShowsRequestError && err.status === 409) retry();
    } finally { setAdding(null); }
  }

  return <Dialog className={`${styles.dialog} ${styles.titleDialog}`} aria-labelledby={headingId} onClose={onClose}>
    <div className={styles.dialogBody}>
      <div className={styles.dialogHeader}>
        <h2 id={headingId}>{shown?.title ?? "Loading…"}</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className={styles.detail}>
        {shown ? <Poster title={shown} sizes="(min-width: 48rem) 176px, 128px" className={styles.detailPoster} />
          : <span className={`${styles.poster} ${styles.skeleton} ${styles.detailPoster}`} />}
        <div className={styles.facts}>
          {shown && <p>{titleFacts(shown, true).text}</p>}
          {detail ? <p>{lengthFacts(detail)}</p> : !error && <span className={`${styles.skeletonLine} ${styles.skeleton}`} />}
          <p className={styles.source}>Rating and details from TMDB</p>
        </div>
      </div>
      {error ? <LoadError message={error} onRetry={retry} /> : !detail ? <div className={styles.overviewSkeleton} aria-busy="true">
        <p role="status" className={styles.srOnly}>Loading details…</p>
        {[1, 2, 3].map((line) => <span key={line} className={`${styles.skeletonLine} ${styles.skeleton}`} />)}
      </div> : <>
        <p className={styles.overview}>{detail.overview || "No overview on TMDB yet."}</p>
        {entry ? <p role="status" className={styles.inLibrary}>✓ In your library · {statusNames[entry.status]}</p>
          : <div className={styles.addGroup} role="group" aria-labelledby={addId}>
            <h3 id={addId}>Add to Library</h3>
            <div className={styles.addButtons}>
              {addStatuses.map((status) => <button key={status} type="button" className={styles.primary} disabled={adding !== null}
                onClick={() => add(status)}>{adding === status ? "Adding…" : statusNames[status]}</button>)}
            </div>
          </div>}
        {addError && <p role="alert" className={styles.error}>{addError}</p>}
        {detail.type === "tv" && !!detail.episodesPerSeason?.length && <section className={styles.seasons} aria-label="Seasons">
          <h3>Seasons</h3>
          <ol>{detail.episodesPerSeason.map((count, i) => <li key={i}><span>Season {i + 1}</span><span>{plural(count, "episode")}</span></li>)}</ol>
        </section>}
      </>}
    </div>
  </Dialog>;
}
