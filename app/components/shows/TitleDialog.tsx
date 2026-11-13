"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { Avatar } from "@/components/common/Avatar";
import { CheckIcon, CloseIcon, SendIcon } from "@/components/common/icons";
import { PersonName } from "@/components/common/PersonName";
import { Alert, Button, Notice } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import type { FriendsState, LibraryEntry } from "@/lib/show-types";
import {
  addStatuses,
  formatRuntime,
  progressOf,
  statusNames,
  titleKey,
  type LibraryItem,
  type LibraryStatus,
  type TitleDetail,
  type TitleSummary,
} from "@/lib/show-types";
import { statusIcons } from "./AddToLibrary";
import { useLibrary } from "./library";
import { LibraryProgress, RemoveFromLibrary, StatusControls } from "./LibraryControls";
import { seenTitle, showsRequest, useOpenTitle, useShowsData } from "./shows-data";
import { TmdbAttribution } from "./TmdbAttribution";
import { LoadError, Poster, TitleRow, titleFacts } from "./TitleGrid";
import styles from "./Shows.module.css";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// "2 seasons · 18 episodes", or a movie's runtime.
function lengthFacts(detail: TitleDetail): string {
  if (detail.type === "movie") return detail.runtime ? formatRuntime(detail.runtime) : "";
  const seasons = detail.episodesPerSeason ?? [];
  const episodes = seasons.reduce((sum, count) => sum + count, 0);
  return [seasons.length > 0 && plural(seasons.length, "season"), episodes > 0 && plural(episodes, "episode")]
    .filter(Boolean)
    .join(" · ");
}

/** The poster's `sizes`, for the poster and the blurred copy behind the top, so both are the same file. */
const posterSizes = "(min-width: 48rem) 208px, 104px";

// The overview, cut to four lines with More to read the rest (and Less), when
// it's longer: the actions stay near the top. ResizeObserver says whether it
// is cut, once shown and whenever its width changes.
function Overview({ text }: { text: string }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const paragraph = ref.current;
    if (!paragraph || open) return;
    const observer = new ResizeObserver(() => setCut(paragraph.scrollHeight > paragraph.clientHeight + 1));
    observer.observe(paragraph);
    return () => observer.disconnect();
  }, [open, text]);
  return (
    <div className={styles.overviewBlock}>
      <p ref={ref} id={id} className={`${styles.overview} ${open ? "" : styles.overviewCut}`}>
        {text}
      </p>
      {(cut || open) && (
        <button
          type="button"
          className={styles.textButton}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

// A TV show's seasons with their episodes; for one in the library, which are
// watched (a tick, on the faded green of a completed title) and how far into
// the current one.
function Seasons({ seasons, item }: { seasons: readonly number[]; item: LibraryItem | undefined }) {
  const status = item?.library.status;
  const progress = item && status === "watching" ? progressOf(item.library) : null;
  return (
    <section className={styles.seasons} aria-label="Seasons">
      <h3>Seasons</h3>
      <ol>
        {seasons.map((count, i) => {
          const season = i + 1;
          const watched =
            status === "completed" ||
            (!!progress && (season < progress.season || (season === progress.season && progress.episode >= count)));
          const current = !watched && progress?.season === season ? progress : null;
          return (
            <li key={i} data-state={watched ? "watched" : current ? "current" : undefined}>
              <span>Season {season}</span>
              <span className={styles.seasonEpisodes}>
                {current ? `${current.episode} of ${plural(count, "episode")}` : plural(count, "episode")}
                {watched && (
                  <>
                    <CheckIcon />
                    <span className={ui.srOnly}>, watched</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const statusWords: Record<LibraryStatus, string> = {
  watching: "Watching",
  completed: "Watched it",
  planned: "Wants to watch it",
};

/** The user's friends who have the title: each one's picture, name and how far they are. */
function FriendsWithIt({ friends }: { friends: TitleDetail["friends"] }) {
  const id = useId();
  if (!friends.length) return null;
  return (
    <section className={styles.friendsWithIt} aria-labelledby={id}>
      <h3 id={id}>Friends</h3>
      <ul>
        {friends.map((friend) => (
          <li key={friend.id}>
            <Avatar username={friend.username} url={friend.avatarUrl} className={styles.friendAvatar} />
            <span>
              <PersonName person={friend} />
              <span className={styles.friendStatus}>{statusWords[friend.status]}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Recommend to a friend: the user's friends, one button each; the title shows
 * in their Discover (Recommended by Friends) until they add it.
 */
function RecommendToFriend({ title }: { title: Pick<TitleSummary, "type" | "tmdbId" | "title"> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const friends = useShowsData<FriendsState>(open ? "/friends" : null, false);
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  async function send(friend: FriendsState["friends"][number]) {
    setBusy(friend.id);
    setNotice(null);
    try {
      await showsRequest("/recommendations", {
        method: "POST",
        body: { friendId: friend.id, type: title.type, tmdbId: title.tmdbId },
      });
      setSent((current) => new Set(current).add(friend.id));
      setNotice({ text: `Sent ${title.title} to ${friend.name ?? friend.username}.` });
    } catch (error) {
      setNotice({ text: (error as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className={styles.recommend} aria-labelledby={id}>
      <h3 id={id} className={ui.srOnly}>
        Recommend
      </h3>
      <Button aria-expanded={open} onClick={() => setOpen(!open)}>
        <SendIcon />
        Recommend to a friend
      </Button>
      {open &&
        (friends.loading ? (
          <p className={ui.muted}>Loading your friends…</p>
        ) : friends.error ? (
          <LoadError message={friends.error} onRetry={friends.retry} />
        ) : !friends.data?.friends.length ? (
          <p className={ui.muted}>Add friends in Profile to recommend titles to them.</p>
        ) : (
          <ul className={styles.recommendList}>
            {friends.data.friends.map((friend) => (
              <li key={friend.id}>
                <Avatar username={friend.username} url={friend.avatarUrl} className={styles.friendAvatar} />
                <PersonName person={friend} />
                <Button busy={busy === friend.id} disabled={sent.has(friend.id)} onClick={() => void send(friend)}>
                  {sent.has(friend.id) ? "Sent" : "Send"}
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {notice && <Notice error={notice.error}>{notice.text}</Notice>}
    </section>
  );
}

/** More like this: TMDB's recommendations for people who liked the title, a row of posters that open their own panel. */
function MoreLikeThis({ title }: { title: Pick<TitleSummary, "type" | "tmdbId"> }) {
  const id = useId();
  const openTitle = useOpenTitle();
  const { data, error, loading, retry } = useShowsData<TitleSummary[]>(`/titles/${title.type}/${title.tmdbId}/similar`);
  if (!loading && !error && !data?.length) return null;
  return (
    <section className={styles.moreLikeThis} aria-labelledby={id}>
      <h3 id={id}>More like this</h3>
      {loading ? (
        <p className={ui.muted}>Loading…</p>
      ) : error ? (
        <LoadError message={error} onRetry={retry} />
      ) : (
        <TitleRow titles={data!} label="More like this" onOpen={openTitle} />
      )}
    </section>
  );
}

/**
 * A title's detail panel (panel id "title:tv:123"), laid out as the title's
 * page, over a blurred copy of the poster. On one side, the poster with the
 * title and its facts under it (beside it on a phone), then, for a title in
 * the library, its status and Favourite; on the other, the synopsis first,
 * then Add to Library (or a TV show's progress once it's being watched), the
 * seasons, and Remove from library last. On a wide screen the poster's side
 * stays in view.
 */
export function TitleDialog({ title, onClose }: { title: Pick<TitleSummary, "type" | "tmdbId">; onClose: () => void }) {
  const headingId = useId();
  const addId = useId();
  const synopsisId = useId();
  const key = titleKey(title);
  const library = useLibrary();
  const { data: detail, error, retry } = useShowsData<TitleDetail>(`/titles/${title.type}/${title.tmdbId}`, false);
  const [adding, setAdding] = useState<LibraryStatus | null>(null);
  const [addError, setAddError] = useState("");
  // Just removed: what it was, for Undo, which adds it back as it was.
  const [removed, setRemoved] = useState<LibraryEntry | null>(null);
  const firstAdd = useRef<HTMLButtonElement>(null);
  // The focused Remove button is gone: on to adding it again.
  useEffect(() => {
    if (removed) firstAdd.current?.focus();
  }, [removed]);
  async function undoRemove(entry: LibraryEntry) {
    setRemoved(null);
    setAddError("");
    try {
      await library.add(title, entry.status);
      const { currentSeason, currentEpisode, isFavourite } = entry;
      if (currentSeason !== null || isFavourite) library.change(title, { currentSeason, currentEpisode, isFavourite });
    } catch (err) {
      setAddError((err as Error).message);
    }
  }
  const shown: TitleSummary | undefined = detail ?? seenTitle(key);
  const item = library.find(title);
  const length = detail && lengthFacts(detail);

  async function add(status: (typeof addStatuses)[number]) {
    setAdding(status);
    setAddError("");
    setRemoved(null);
    try {
      await library.add(title, status);
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog className={`${styles.dialog} ${styles.titleDialog}`} aria-labelledby={headingId} onClose={onClose}>
      <div className={styles.dialogBody}>
        {shown?.posterPath && (
          <div className={styles.titleBackdrop} aria-hidden="true">
            <Poster title={shown} sizes={posterSizes} />
          </div>
        )}
        {/* Stays at the top while the panel scrolls; takes no room of its own. */}
        <div className={styles.closeBar}>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className={styles.titlePage}>
          <div className={styles.titleAside}>
            <div className={styles.titlePoster}>
              {shown ? (
                <Poster title={shown} sizes={posterSizes} className={styles.detailPoster} />
              ) : (
                <span className={`${styles.poster} ${styles.skeleton} ${styles.detailPoster}`} />
              )}
            </div>
            <div className={styles.titleHead}>
              <h2 id={headingId}>{shown?.title ?? "Loading…"}</h2>
              {shown && <p className={styles.titleFacts}>{titleFacts(shown, true).text}</p>}
              {!!detail?.genres.length && <p className={styles.genres}>{detail.genres.join(" · ")}</p>}
              {detail
                ? length && <p className={styles.titleFacts}>{length}</p>
                : !error && <span className={`${styles.skeletonLine} ${styles.skeleton} ${styles.skeletonShort}`} />}
            </div>
            {detail && item && <StatusControls item={item} />}
          </div>
          <div className={styles.titleMain}>
            {error ? (
              <LoadError message={error} onRetry={retry} />
            ) : !detail ? (
              <div className={styles.overviewSkeleton} aria-busy="true">
                <p role="status" className={ui.srOnly}>
                  Loading details…
                </p>
                {[1, 2, 3].map((line) => (
                  <span key={line} className={`${styles.skeletonLine} ${styles.skeleton}`} />
                ))}
              </div>
            ) : (
              <>
                <section className={styles.synopsis} aria-labelledby={synopsisId}>
                  <h3 id={synopsisId}>Synopsis</h3>
                  <Overview key={detail.overview} text={detail.overview || "No overview on TMDB yet."} />
                </section>
                <FriendsWithIt friends={detail.friends} />
                {!library.items ? (
                  library.loadError ? (
                    <LoadError message={library.loadError} onRetry={library.reload} />
                  ) : (
                    <span className={`${styles.skeletonLine} ${styles.skeleton}`} />
                  )
                ) : item ? (
                  <LibraryProgress item={item} detail={detail} />
                ) : (
                  <div className={styles.addGroup} role="group" aria-labelledby={addId}>
                    {removed && (
                      <p role="status" className={styles.removedNotice}>
                        Removed from your library.
                        <Button variant="quiet" onClick={() => void undoRemove(removed)}>
                          Undo
                        </Button>
                      </p>
                    )}
                    <h3 id={addId}>Add to Library</h3>
                    <div className={styles.addButtons}>
                      {addStatuses.map((status, i) => {
                        const Icon = statusIcons[status];
                        return (
                          <button
                            key={status}
                            type="button"
                            className={styles.addOption}
                            data-status={status}
                            disabled={adding !== null}
                            ref={i === 0 ? firstAdd : undefined}
                            onClick={() => add(status)}
                          >
                            <Icon />
                            {adding === status ? "Adding…" : statusNames[status]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {addError && <Alert>{addError}</Alert>}
                {detail.type === "tv" && !!detail.episodesPerSeason?.length && (
                  <Seasons seasons={detail.episodesPerSeason} item={item} />
                )}
                <MoreLikeThis title={title} />
                <RecommendToFriend title={detail} />
                {item && <RemoveFromLibrary item={item} onRemoved={setRemoved} />}
                <TmdbAttribution />
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
