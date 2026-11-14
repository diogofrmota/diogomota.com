"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, SearchIcon } from "@/components/common/icons";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { statusNames, type LibraryItem, type LibraryStatus, type MediaType } from "@/lib/show-types";
import { useRememberedType } from "./shows-data";
import { TypeSwitch } from "./Discover";
import { ChangeError, useLibrary } from "./library";
import { LibrarySection } from "./LibraryGrid";
import { Onboarding } from "./Onboarding";
import { LoadError } from "./TitleGrid";
import styles from "./Shows.module.css";

function DiscoverLink({ children }: { children: React.ReactNode }) {
  const { setView } = useAppView();
  return (
    <button type="button" className={styles.inlineLink} onClick={() => setView("discover")}>
      {children}
    </button>
  );
}

function Empty({ status, type }: { status: LibraryStatus; type: MediaType }) {
  const kind = type === "tv" ? "shows" : "movies";
  return status === "watching" ? (
    <>
      You&rsquo;re not watching any {kind} yet — <DiscoverLink>explore Discover!</DiscoverLink>
    </>
  ) : status === "planned" ? (
    <>
      No {kind} planned yet — <DiscoverLink>explore Discover!</DiscoverLink>
    </>
  ) : (
    `No ${kind} completed yet. Finished one? Mark it as Completed from its card.`
  );
}

// The section's heading says the status, so its posters don't (LibraryGrid,
// statusBadges): every one of them is of it. With a search, an empty section
// says that nothing in it matches.
function Section({
  status,
  type,
  items,
  search,
}: {
  status: LibraryStatus;
  type: MediaType;
  items: LibraryItem[] | null;
  search: string;
}) {
  const heading = statusNames[status];
  const kind = type === "tv" ? "TV shows" : "movies";
  return (
    <LibrarySection
      heading={heading}
      label={`${heading} ${kind}`}
      loadingLabel={`Loading your ${heading.toLowerCase()} ${kind}…`}
      items={items}
      empty={search ? `No ${heading.toLowerCase()} ${kind} match “${search}”.` : <Empty status={status} type={type} />}
      plannedBadge={false}
      statusBadges={false}
    />
  );
}

type Sort = "recent" | "az";
/** Past this many titles of a type, the Library has a search and a sort. */
const manyTitles = 6;

// The Library's sections, in this order: what is being watched first.
const sectionOrder: readonly LibraryStatus[] = ["watching", "planned", "completed"];

// An empty library once the guide is skipped or done, or emptied again.
function Welcome({ onSetUp }: { onSetUp: () => void }) {
  const { setView, openPanel } = useAppView();
  return (
    <div className={styles.welcome}>
      <h2>Start by discovering shows!</h2>
      <p>
        Add TV shows and movies to your library from Discover or search, then keep track of what you&rsquo;re watching,
        what&rsquo;s planned and what you&rsquo;ve finished.
      </p>
      <div className={styles.offerButtons}>
        <Button variant="primary" onClick={() => setView("discover")}>
          Go to Discover
        </Button>
        <Button onClick={() => openPanel("search")}>Search</Button>
        <Button onClick={onSetUp}>Set up step by step</Button>
      </div>
    </div>
  );
}

/**
 * Library, the user's library: Watching, Planned and Completed, for TV
 * shows or movies. A library that is empty when the app opens gets the guide
 * (Onboarding) instead.
 */
export function Watchlist() {
  const { items, loadError, checked, reload } = useLibrary();
  // TV Shows or Movies: the last one chosen here, on this device.
  const [type, setType] = useRememberedType("library");
  // Whether the guide shows: decided once the library first loads (from the
  // server: one kept in this browser may be from before titles were added), then until
  // it is skipped or done, however many titles it adds; or until the user comes
  // back to Library from another view with titles in the library (added
  // in the guide or there), which then shows them. Its effects end while
  // another view is shown, and start again when it's back, in this order.
  const [guide, setGuide] = useState<boolean | null>(null);
  if (guide === null && items && checked) setGuide(items.length === 0);
  const hasTitles = useRef(false);
  const left = useRef(false);
  useEffect(() => {
    hasTitles.current = !!items?.length;
  }, [items]);
  useEffect(() => {
    if (left.current && hasTitles.current) setGuide((shown) => shown && false);
    return () => {
      left.current = true;
    };
  }, []);
  // Search (by title) and sort (the latest added or changed first, as they come, or A to Z), for a long library.
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const allOfType = items?.filter((item) => item.type === type) ?? null;
  const controls = (allOfType?.length ?? 0) > manyTitles;
  const query = controls ? search.trim().toLocaleLowerCase() : "";
  const matching = allOfType?.filter((item) => !query || item.title.toLocaleLowerCase().includes(query)) ?? null;
  const ofType =
    matching && controls && sort === "az" ? [...matching].sort((a, b) => a.title.localeCompare(b.title)) : matching;
  return (
    <div className={styles.view}>
      {/* The Library tab shows which view this is. */}
      <h1 className={ui.srOnly}>Library</h1>
      <ChangeError className={styles.viewError} />
      {items && loadError && <LoadError message={loadError} onRetry={reload} />}
      {!items && loadError ? (
        <LoadError message={loadError} onRetry={reload} />
      ) : items && guide ? (
        <Onboarding onDone={() => setGuide(false)} />
      ) : items?.length === 0 ? (
        <Welcome onSetUp={() => setGuide(true)} />
      ) : (
        <>
          {/* On the left, as the posters are under it; then, for a long library, its search and sort. */}
          <div className={styles.libraryTop}>
            <TypeSwitch type={type} onChange={setType} />
            {controls && (
              <div className={styles.libraryControls}>
                <label className={styles.librarySearch}>
                  <span className={ui.srOnly}>Search your library</span>
                  <SearchIcon />
                  <input
                    type="search"
                    value={search}
                    placeholder={`Search your ${type === "tv" ? "TV shows" : "movies"}`}
                    autoComplete="off"
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label className={styles.librarySort}>
                  <span className={ui.srOnly}>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="recent">Recently updated</option>
                    <option value="az">A–Z</option>
                  </select>
                  <ChevronDownIcon />
                </label>
              </div>
            )}
          </div>
          {/* Keyed by type, so each section starts collapsed. */}
          {sectionOrder.map((status) => (
            <Section
              key={`${type}/${status}`}
              status={status}
              type={type}
              items={ofType && ofType.filter((item) => item.library.status === status)}
              search={query ? search.trim() : ""}
            />
          ))}
        </>
      )}
    </div>
  );
}
