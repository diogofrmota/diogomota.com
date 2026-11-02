"use client";
import { useEffect, useId, useRef, useState } from "react";
import { addStatuses, formatRuntime, statusNames, titleKey, type LibraryStatus, type TitleDetail, type TitleSummary } from "@/lib/show-types";
import { Dialog } from "./Dialog";
import { useLibrary } from "./library";
import { LibraryControls } from "./LibraryControls";
import { seenTitle, useShowsData } from "./shows-data";
import { LoadError, Poster, titleFacts } from "./TitleGrid";
import styles from "./Shows.module.css";

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

/** A title's detail panel (panel id "title:tv:123"): Add to Library, or the library controls once it is there. */
export function TitleDialog({ title, onClose }: { title: Pick<TitleSummary, "type" | "tmdbId">; onClose: () => void }) {
  const headingId = useId();
  const addId = useId();
  const key = titleKey(title);
  const library = useLibrary();
  const { data: detail, error, retry } = useShowsData<TitleDetail>(`/titles/${title.type}/${title.tmdbId}`, false);
  const [adding, setAdding] = useState<LibraryStatus | null>(null);
  const [addError, setAddError] = useState("");
  const [removed, setRemoved] = useState(false);
  const firstAdd = useRef<HTMLButtonElement>(null);
  // The focused Remove button is gone: on to adding it again.
  useEffect(() => { if (removed) firstAdd.current?.focus(); }, [removed]);
  const shown: TitleSummary | undefined = detail ?? seenTitle(key);
  const item = library.find(title);

  async function add(status: (typeof addStatuses)[number]) {
    setAdding(status); setAddError(""); setRemoved(false);
    try {
      await library.add(title, status);
    } catch (err) {
      setAddError((err as Error).message);
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
        {!library.items ? (library.loadError ? <LoadError message={library.loadError} onRetry={library.reload} />
          : <span className={`${styles.skeletonLine} ${styles.skeleton}`} />)
          : item ? <LibraryControls item={item} detail={detail} onRemoved={() => setRemoved(true)} />
          : <div className={styles.addGroup} role="group" aria-labelledby={addId}>
            {removed && <p role="status" className={styles.muted}>Removed from your library.</p>}
            <h3 id={addId}>Add to Library</h3>
            <div className={styles.addButtons}>
              {addStatuses.map((status, i) => <button key={status} type="button" className={styles.primary} disabled={adding !== null}
                ref={i === 0 ? firstAdd : undefined}
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
