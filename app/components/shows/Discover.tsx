"use client";
import { useId, useState } from "react";
import { SearchIcon } from "@/components/common/icons";
import { useAppView } from "@/hooks/useAppView";
import type { DiscoverSection, MediaType, TitleSummary } from "@/lib/show-types";
import { useOpenTitle, useShowsData } from "./shows-data";
import { LoadError, SkeletonGrid, TitleGrid } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

// A grid shows this many titles until "Show all" (TMDB's lists have 20).
const collapsedCount = 12;

const sections: { id: DiscoverSection; heading: string }[] = [
  { id: "top-rated", heading: "Top Rated" },
  { id: "popular", heading: "Popular" },
  { id: "friends", heading: "Added by Friends" },
];

function Section({ type, section, heading }: { type: MediaType; section: DiscoverSection; heading: string }) {
  const id = useId();
  const openTitle = useOpenTitle();
  const [expanded, setExpanded] = useState(false);
  const { data, error, loading, retry } = useShowsData<TitleSummary[]>(`/discover/${type}/${section}`);
  const kind = type === "tv" ? "TV shows" : "movies";
  return <section className={styles.section} aria-labelledby={id} aria-busy={loading}>
    <h2 id={id}>{heading}</h2>
    {loading ? <SkeletonGrid count={collapsedCount} label={`Loading ${heading.toLowerCase()} ${kind}…`} />
      : error ? <LoadError message={error} onRetry={retry} />
      : !data?.length ? <p className={styles.empty}>{section === "friends"
        ? `No ${kind} from friends yet. Once you have friends, the ${kind} in their libraries show up here.`
        : `TMDB has no ${kind} here right now.`}</p>
      : <>
        <TitleGrid titles={expanded ? data : data.slice(0, collapsedCount)} label={`${heading} ${kind}`} onOpen={openTitle} />
        {data.length > collapsedCount && <button type="button" className={styles.more} aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${data.length}`}</button>}
      </>}
  </section>;
}

/** A search field look-alike that opens the search panel. */
export function SearchLauncher() {
  const { openPanel } = useAppView();
  return <button type="button" className={styles.launcher} onClick={() => openPanel("search")}>
    <SearchIcon /><span>Search TV shows and movies</span>
  </button>;
}

export function Discover() {
  const [type, setType] = useState<MediaType>("tv");
  return <div className={styles.view}>
    <h1 className={styles.heading}>Discover</h1>
    <SearchLauncher />
    <div className={styles.switcher} role="group" aria-label="Show">
      <button type="button" aria-pressed={type === "tv"} onClick={() => setType("tv")}>TV Shows</button>
      <button type="button" aria-pressed={type === "movie"} onClick={() => setType("movie")}>Movies</button>
    </div>
    {/* Keyed by type, so each list starts collapsed. */}
    {sections.map((section) => <Section key={`${type}/${section.id}`} type={type} section={section.id} heading={section.heading} />)}
    <TmdbAttribution />
  </div>;
}
