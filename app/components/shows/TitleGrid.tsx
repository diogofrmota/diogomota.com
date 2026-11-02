"use client";
import Image, { type ImageLoader } from "next/image";
import { titleKey, tmdbImageUrl, type TitleSummary } from "@/lib/show-types";
import styles from "./Shows.module.css";

// Posters come straight from TMDB's image server, which has them in fixed sizes:
// each width in next/image's srcset gets the closest one.
const tmdbLoader: ImageLoader = ({ src, width }) => tmdbImageUrl(src, width);

export function Poster({ title, sizes, className = "" }: { title: TitleSummary; sizes: string; className?: string }) {
  if (!title.posterPath) return <span className={`${styles.poster} ${styles.noPoster} ${className}`} aria-hidden="true">{title.title}</span>;
  return <Image loader={tmdbLoader} src={title.posterPath} alt="" width={342} height={513} sizes={sizes}
    className={`${styles.poster} ${className}`} />;
}

const typeName = (title: TitleSummary) => title.type === "tv" ? "TV show" : "Movie";

/** "2021 · ★ 7.8" (with the type first if `withType`), and the same for screen readers. */
export function titleFacts(title: TitleSummary, withType = false) {
  const facts = [withType && typeName(title), title.year].filter(Boolean);
  return {
    text: [...facts, title.rating === null ? "No rating" : `★ ${title.rating.toFixed(1)}`].join(" · "),
    label: [title.title, ...facts, title.rating === null ? "no rating yet" : `rated ${title.rating.toFixed(1)} out of 10`].join(", "),
  };
}

// Card width: about a third of a phone screen, 9rem or so on desktop.
const cardSizes = "(min-width: 48rem) 160px, 34vw";

export function TitleGrid({ titles, label, withType = false, onOpen }: {
  titles: readonly TitleSummary[]; label: string; withType?: boolean; onOpen: (title: TitleSummary) => void;
}) {
  return <ul className={styles.grid} aria-label={label}>
    {titles.map((title) => {
      const facts = titleFacts(title, withType);
      return <li key={titleKey(title)}>
        <button type="button" className={styles.card} aria-label={facts.label} onClick={() => onOpen(title)}>
          <Poster title={title} sizes={cardSizes} />
          <span className={styles.cardTitle}>{title.title}</span>
          <span className={styles.cardMeta}>{facts.text}</span>
        </button>
      </li>;
    })}
  </ul>;
}

/** Grey cards in place of a grid that is loading, with `label` for screen readers. */
export function SkeletonGrid({ count, label }: { count: number; label: string }) {
  return <>
    <p role="status" className={styles.srOnly}>{label}</p>
    <ul className={styles.grid} aria-hidden="true" data-testid="skeleton">
      {Array.from({ length: count }, (_, i) => <li key={i}>
        <span className={`${styles.poster} ${styles.skeleton}`} />
        <span className={`${styles.skeletonLine} ${styles.skeleton}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonShort} ${styles.skeleton}`} />
      </li>)}
    </ul>
  </>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className={styles.error} role="alert">
    <p>{message}</p>
    <button type="button" onClick={onRetry}>Retry</button>
  </div>;
}
