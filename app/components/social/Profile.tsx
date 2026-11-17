"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { BookIcon } from "@/components/common/icons";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { Poster, LoadError } from "../shows/TitleGrid";
import {
  formatEpisode,
  shareWatched,
  formatHours,
  statusNames,
  titleKey,
  type FriendItem,
  type TitleSummary,
} from "@/lib/show-types";
import { progressPercent, shelfLabels, type Shelf } from "@/lib/book-types";
import type { SharedBook, SocialProfile } from "@/lib/social-types";
import { useSocialData } from "./social-data";
import styles from "./Social.module.css";

export const showHref = (title: TitleSummary) => `/shows?p=title:${titleKey(title)}`;

function Shelf({
  heading,
  empty,
  children,
  count,
}: {
  heading: string;
  empty: string;
  children: React.ReactNode[];
  count: number;
}) {
  const id = useId();
  const [all, setAll] = useState(false);
  return (
    <section className={styles.shelf} aria-labelledby={id}>
      <h3 id={id}>
        {heading}{" "}
        <span className={styles.count} aria-hidden="true">
          {count}
        </span>
      </h3>
      {!count ? (
        <p className={ui.muted}>{empty}</p>
      ) : (
        <>
          <ul className={styles.grid} aria-label={heading}>
            {all ? children : children.slice(0, 12)}
          </ul>
          {!all && count > 12 && <Button onClick={() => setAll(true)}>Show all {count}</Button>}
        </>
      )}
    </section>
  );
}

function ShowCard({ item }: { item: FriendItem }) {
  const episode =
    item.type === "tv" && item.library.currentSeason !== null && item.library.currentEpisode !== null
      ? formatEpisode({ season: item.library.currentSeason, episode: item.library.currentEpisode })
      : null;
  return (
    <li className={styles.card}>
      <Link href={showHref(item)}>
        <Poster title={item} sizes="(max-width: 600px) 40vw, 150px" className={styles.cover} />
        <strong>{item.title}</strong>
        <span>
          {item.year ?? "Year unknown"} · {item.type === "tv" ? "TV show" : "Movie"}
        </span>
        <span>
          {statusNames[item.library.status]}
          {item.library.isFavourite ? " · Favourite" : ""}
        </span>
        {episode && <span>{episode}</span>}
        {item.type === "tv" && item.library.status !== "planned" && item.episodesPerSeason?.length ? (
          <progress aria-label={`Episodes watched for ${item.title}`} value={shareWatched(item)} max={1} />
        ) : null}
      </Link>
    </li>
  );
}

function BookCover({ book }: { book: SharedBook }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.cover} aria-hidden="true">
      {book.coverId && !failed ? (
        // Remote catalogue covers use the same direct image loading as Books.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg?default=false`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <BookIcon />
      )}
    </div>
  );
}

function BookCard({ book }: { book: SharedBook }) {
  const percent = progressPercent(book);
  return (
    <li className={styles.card}>
      <BookCover book={book} />
      <strong>{book.title}</strong>
      <span>{book.author || "Unknown author"}</span>
      <span>
        {book.pagesRead.toLocaleString("en-GB")}
        {book.totalPages === null ? " pages read" : ` / ${book.totalPages.toLocaleString("en-GB")} pages`}
      </span>
      {percent !== null && <progress aria-label={`Reading progress for ${book.title}`} value={percent} max={100} />}
    </li>
  );
}

export function Profile({ personId, own = false }: { personId?: string; own?: boolean }) {
  const {
    data: profile,
    error,
    loading,
    retry,
  } = useSocialData<SocialProfile>(personId ? `/profiles/${personId}` : "/profile");
  useEffect(() => {
    if (profile && window.location.hash === "#books") document.getElementById("books")?.scrollIntoView();
  }, [profile]);
  if (error)
    return (
      <div className={styles.view}>
        <h1 className={ui.heading}>Profile</h1>
        <LoadError message={error.message} onRetry={retry} />
      </div>
    );
  if (loading || !profile)
    return (
      <div className={styles.view}>
        <h1 className={ui.heading}>{own ? "My profile" : "Profile"}</h1>
        <p role="status">Loading profile...</p>
      </div>
    );
  const watching = profile.shows.items;
  const books = profile.books.items;
  const stats = profile.shows.stats;
  return (
    <div className={styles.view}>
      <header className={styles.profileHeader}>
        <Avatar username={profile.username} name={profile.name} url={profile.avatarUrl} className={styles.avatar} />
        <h1 className={ui.heading}>{own ? "My profile" : profile.name || `@${profile.username}`}</h1>
        {own && profile.name && <p className={styles.name}>{profile.name}</p>}
        <p className={ui.muted}>@{profile.username}</p>
        <p className={ui.muted}>Visible to accepted friends.</p>
        {own && <Link href="/account">Edit profile in Account</Link>}
      </header>
      <section aria-labelledby="shows-heading" className={styles.section}>
        <h2 id="shows-heading">Shows</h2>
        <dl className={styles.stats} aria-label="Shows statistics">
          <div>
            <dt>TV shows completed</dt>
            <dd>{stats.tvCompleted.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Movies completed</dt>
            <dd>{stats.moviesCompleted.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Episodes watched</dt>
            <dd>{stats.episodesWatched.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Hours watched</dt>
            <dd>{formatHours(stats.minutesWatched)}</dd>
          </div>
        </dl>
        {(["watching", "planned", "completed", "favourites"] as const).map((status) => {
          const items = watching.filter((item) =>
            status === "favourites" ? item.library.isFavourite : item.library.status === status,
          );
          return (
            <Shelf
              key={status}
              heading={status === "favourites" ? "Favourites" : statusNames[status]}
              count={items.length}
              empty="Nothing here yet."
            >
              {items.map((item) => (
                <ShowCard key={titleKey(item)} item={item} />
              ))}
            </Shelf>
          );
        })}
        {profile.bothPlanned.length > 0 && (
          <section className={styles.shelf} aria-labelledby="together-heading">
            <h3 id="together-heading">You both want to watch</h3>
            <ul className={styles.together}>
              {profile.bothPlanned.map((item) => (
                <li key={titleKey(item)}>
                  <Link href={showHref(item)}>{item.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
      <section id="books" aria-labelledby="books-heading" className={styles.section}>
        <h2 id="books-heading">Books</h2>
        <dl className={styles.stats} aria-label="Books statistics">
          <div>
            <dt>Want to Read</dt>
            <dd>{profile.books.stats.wantToRead.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Currently Reading</dt>
            <dd>{profile.books.stats.currentlyReading.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{profile.books.stats.finished.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Pages read</dt>
            <dd>{profile.books.stats.pagesRead.toLocaleString("en-GB")}</dd>
          </div>
        </dl>
        {(["currently-reading", "want-to-read", "finished"] as Shelf[]).map((shelf) => {
          const items = books.filter((book) => book.shelf === shelf);
          return (
            <Shelf key={shelf} heading={shelfLabels[shelf]} count={items.length} empty="No books on this shelf yet.">
              {items.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </Shelf>
          );
        })}
      </section>
    </div>
  );
}
