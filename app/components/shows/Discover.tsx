"use client";
import { useId, useState } from "react";
import { SearchIcon } from "@/components/common/icons";
import { useAppView } from "@/hooks/useAppView";
import { discoverSections, type DiscoverSection, type MediaType, type TitleSummary } from "@/lib/show-types";
import { useLibrary } from "./library";
import { useOpenTitle, useShowsData } from "./shows-data";
import { LoadError, SkeletonGrid, TitleRow } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

// A line under the heading, for the sections whose heading doesn't say it all.
const notes: Partial<Record<DiscoverSection, string>> = {
  "for-you": "Picked from TMDB's recommendations for the titles in your library.",
  upcoming: "In cinemas soon.",
};

function emptyText(section: DiscoverSection, kind: string) {
  if (section === "friends") return `No ${kind} from friends yet. Once you have friends, the ${kind} in their libraries show up here.`;
  if (section === "for-you") return `No recommendations for your ${kind} yet. Add a few more, and they'll show up here.`;
  return `TMDB has no ${kind} here right now.`;
}

// A section: a row of up to 20 titles (TitleRow), which scrolls sideways.
function Section({ type, section, heading }: { type: MediaType; section: DiscoverSection; heading: string }) {
  const id = useId();
  const noteId = useId();
  const openTitle = useOpenTitle();
  const { data, error, loading, retry } = useShowsData<TitleSummary[]>(`/discover/${type}/${section}`);
  const kind = type === "tv" ? "TV shows" : "movies";
  const note = notes[section];
  return <section className={styles.section} aria-labelledby={id} aria-describedby={note ? noteId : undefined} aria-busy={loading}>
    <h2 id={id}>{heading}</h2>
    {note && <p id={noteId} className={styles.sectionNote}>{note}</p>}
    {loading ? <SkeletonGrid row count={8} label={`Loading ${heading.toLowerCase()} ${kind}…`} />
      : error ? <LoadError message={error} onRetry={retry} />
      : !data?.length ? <p className={styles.empty}>{emptyText(section, kind)}</p>
      : <TitleRow titles={data} label={`${heading} ${kind}`} onOpen={openTitle} />}
  </section>;
}

/** A search field look-alike that opens the search panel. */
export function SearchLauncher() {
  const { openPanel } = useAppView();
  return <button type="button" className={styles.launcher} onClick={() => openPanel("search")}>
    <SearchIcon /><span>Search TV shows and movies</span>
  </button>;
}

/** The TV Shows | Movies switch at the top of Discover and Home. */
export function TypeSwitch({ type, onChange }: { type: MediaType; onChange: (type: MediaType) => void }) {
  return <div className={styles.switcher} role="group" aria-label="Show">
    <button type="button" aria-pressed={type === "tv"} onClick={() => onChange("tv")}>TV Shows</button>
    <button type="button" aria-pressed={type === "movie"} onClick={() => onChange("movie")}>Movies</button>
  </div>;
}

/** Discover: the search field, then TMDB's lists, recommendations and friends' titles, for TV shows or movies. */
export function Discover() {
  const [type, setType] = useState<MediaType>("tv");
  // For You is made from the library's titles of this type: none, no section.
  const { items } = useLibrary();
  const forYou = !!items?.some((item) => item.type === type);
  const sections = discoverSections[type].filter((section) => section.id !== "for-you" || forYou);
  return <div className={styles.view}>
    <h1 className={styles.heading}>Discover</h1>
    <SearchLauncher />
    <TypeSwitch type={type} onChange={setType} />
    {/* Keyed by type, so each list starts collapsed. */}
    {sections.map((section) => <Section key={`${type}/${section.id}`} type={type} section={section.id} heading={section.heading} />)}
    <TmdbAttribution />
  </div>;
}
