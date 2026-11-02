"use client";
import { useState } from "react";
import { useAppView } from "@/hooks/useAppView";
import { libraryStatuses, statusNames, type LibraryItem, type LibraryStatus, type MediaType } from "@/lib/show-types";
import { TypeSwitch } from "./Discover";
import { ChangeError, useLibrary } from "./library";
import { LibrarySection } from "./LibraryGrid";
import { LoadError } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

function DiscoverLink({ children }: { children: React.ReactNode }) {
  const { setView } = useAppView();
  return <button type="button" className={styles.inlineLink} onClick={() => setView("discover")}>{children}</button>;
}

function Empty({ status, type }: { status: LibraryStatus; type: MediaType }) {
  const kind = type === "tv" ? "shows" : "movies";
  return status === "watching" ? <>You&rsquo;re not watching any {kind} yet — <DiscoverLink>explore Discover!</DiscoverLink></>
    : status === "planned" ? <>No {kind} planned yet — <DiscoverLink>explore Discover!</DiscoverLink></>
    : `No ${kind} completed yet. Finished one? Mark it as Completed from its card.`;
}

function Section({ status, type, items }: { status: LibraryStatus; type: MediaType; items: LibraryItem[] | null }) {
  const heading = statusNames[status];
  const kind = type === "tv" ? "TV shows" : "movies";
  return <LibrarySection heading={heading} label={`${heading} ${kind}`} loadingLabel={`Loading your ${heading.toLowerCase()} ${kind}…`}
    items={items} empty={<Empty status={status} type={type} />} />;
}

// The first visit, and a library emptied again.
function Welcome() {
  const { setView, openPanel } = useAppView();
  return <div className={styles.welcome}>
    <h2>Start by discovering shows!</h2>
    <p>Add TV shows and movies to your library from Discover or search, then keep track of what you&rsquo;re watching, what&rsquo;s planned and what you&rsquo;ve finished.</p>
    <div className={styles.offerButtons}>
      <button type="button" className={styles.primary} onClick={() => setView("discover")}>Go to Discover</button>
      <button type="button" onClick={() => openPanel("search")}>Search</button>
    </div>
  </div>;
}

/** The user's library: Watching, Planned and Completed, for TV shows or movies. */
export function Home() {
  const { items, loadError, reload } = useLibrary();
  const [type, setType] = useState<MediaType>("tv");
  const ofType = items?.filter((item) => item.type === type) ?? null;
  return <div className={styles.view}>
    <h1 className={styles.heading}>Home</h1>
    <ChangeError className={`${styles.error} ${styles.viewError}`} />
    {!items && loadError ? <LoadError message={loadError} onRetry={reload} />
      : items?.length === 0 ? <Welcome />
      : <>
        <TypeSwitch type={type} onChange={setType} />
        {/* Keyed by type, so each section starts collapsed. */}
        {libraryStatuses.map((status) => <Section key={`${type}/${status}`} status={status} type={type}
          items={ofType && ofType.filter((item) => item.library.status === status)} />)}
        <TmdbAttribution />
      </>}
  </div>;
}
