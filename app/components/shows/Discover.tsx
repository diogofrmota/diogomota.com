"use client";
import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon } from "@/components/common/icons";
import { SegmentThumb } from "@/components/common/motion";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { apiRequest } from "@/lib/api-request";
import { discoverSections, type DiscoverSection, type MediaType, type TitleSummary } from "@/lib/show-types";
import { useLibrary } from "./library";
import { useOpenTitle, useRememberedType, useShowsData } from "./shows-data";
import { TmdbAttribution } from "./TmdbAttribution";
import { LoadError, SkeletonGrid, TitleRow } from "./TitleGrid";
import styles from "./Shows.module.css";

// A line under the heading, for the sections whose heading doesn't say it all.
const notes: Partial<Record<DiscoverSection, string>> = {
  recommended: "What your friends sent you. Add one, and it moves to your library.",
  "for-you": "Picked from TMDB's recommendations for the titles in your library.",
  upcoming: "In cinemas soon.",
};

function emptyText(section: DiscoverSection, kind: string) {
  if (section === "friends")
    return `No ${kind} from friends yet. Once you have friends, the ${kind} in their libraries show up here.`;
  if (section === "for-you")
    return `No recommendations for your ${kind} yet. Add a few more, and they'll show up here.`;
  return `TMDB has no ${kind} here right now.`;
}

/**
 * Whether an element has come near the screen (within a screen's height of it),
 * once: a section's titles load then, not all of Discover's at once.
 */
function useNearScreen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near];
}

// A section: a row of up to 20 titles (TitleRow), which scrolls sideways. It
// loads once it comes near the screen, so opening Discover on a phone loads
// what is seen first, and the posters below as they are scrolled to.
function Section({ type, section, heading }: { type: MediaType; section: DiscoverSection; heading: string }) {
  const id = useId();
  const noteId = useId();
  const openTitle = useOpenTitle();
  const [ref, near] = useNearScreen<HTMLElement>();
  const { data, error, loading, retry } = useShowsData<TitleSummary[]>(
    near ? `/discover/${type}/${section}` : null,
    // What friends recommended changes when they do: loaded again each time.
    section !== "recommended",
  );
  const kind = type === "tv" ? "TV shows" : "movies";
  const note = notes[section];
  // Recommended by Friends shown: its recommendations are seen, and home's
  // Shows badge stops counting them (lib/badges.ts).
  const recommendationsShown = section === "recommended" && !!data?.length;
  useEffect(() => {
    if (!recommendationsShown) return;
    apiRequest("/api/shows/recommendations/seen", {
      method: "POST",
      body: { type },
      fallback: "Couldn't mark the recommendations as seen.",
    }).catch(() => {});
  }, [recommendationsShown, type]);
  // Recommended by Friends only shows when there is something in it.
  if (section === "recommended" && !data?.length) return <div ref={ref as React.RefObject<HTMLDivElement>} />;
  return (
    <section
      ref={ref}
      className={styles.section}
      aria-labelledby={id}
      aria-describedby={note ? noteId : undefined}
      aria-busy={loading || !near}
    >
      <h2 id={id}>{heading}</h2>
      {note && (
        <p id={noteId} className={styles.sectionNote}>
          {note}
        </p>
      )}
      {!near || loading ? (
        <SkeletonGrid row count={8} label={`Loading ${heading.toLowerCase()} ${kind}…`} />
      ) : error ? (
        <LoadError message={error} onRetry={retry} />
      ) : !data?.length ? (
        <p className={styles.empty}>{emptyText(section, kind)}</p>
      ) : (
        <TitleRow titles={data} label={`${heading} ${kind}`} onOpen={openTitle} />
      )}
    </section>
  );
}

/** A search field look-alike that opens the search panel. */
export function SearchLauncher() {
  const { openPanel } = useAppView();
  return (
    <button type="button" className={styles.launcher} data-press="wide" onClick={() => openPanel("search")}>
      <SearchIcon />
      <span>Search TV shows and movies</span>
    </button>
  );
}

const typeOptions: readonly { type: MediaType; label: string }[] = [
  { type: "tv", label: "TV Shows" },
  { type: "movie", label: "Movies" },
];

/**
 * The TV Shows | Movies switch at the top of Discover and Library: the raised
 * thumb is one object that slides to the one chosen (a SegmentThumb, its
 * layoutId this switch's own), and each label keeps its bold width.
 */
export function TypeSwitch({ type, onChange }: { type: MediaType; onChange: (type: MediaType) => void }) {
  const layoutId = `type-switch:${useId()}`;
  return (
    <div className={styles.switcher} role="group" aria-label="Show">
      {typeOptions.map((option) => (
        <button
          key={option.type}
          type="button"
          aria-pressed={type === option.type}
          onClick={() => onChange(option.type)}
        >
          <span className={styles.switchLabel}>
            <span>{option.label}</span>
            <span aria-hidden="true">{option.label}</span>
          </span>
          {type === option.type && <SegmentThumb layoutId={layoutId} className={styles.thumb} />}
        </button>
      ))}
    </div>
  );
}

/**
 * Discover: the search field and the TV Shows | Movies switch (the last one
 * chosen, on this device), centered, then what friends recommended, TMDB's
 * lists, recommendations and friends' titles, for TV shows or movies. TMDB's
 * logo and notice at the bottom.
 */
export function Discover() {
  const [type, setType] = useRememberedType("discover");
  // For You is made from the library's titles of this type: none, no section.
  const { items } = useLibrary();
  const forYou = !!items?.some((item) => item.type === type);
  const sections = discoverSections[type].filter((section) => section.id !== "for-you" || forYou);
  return (
    <div className={styles.view}>
      {/* The Discover tab shows which view this is. */}
      <h1 className={ui.srOnly}>Discover</h1>
      <div className={styles.discoverTop}>
        <SearchLauncher />
        <TypeSwitch type={type} onChange={setType} />
      </div>
      {/* Keyed by type, so each list starts collapsed. */}
      {sections.map((section) => (
        <Section key={`${type}/${section.id}`} type={type} section={section.id} heading={section.heading} />
      ))}
      <TmdbAttribution />
    </div>
  );
}
