"use client";
import { useId } from "react";
import { useAppView } from "@/hooks/useAppView";
import type { FriendProfile, Person } from "@/lib/show-types";
import { Dialog } from "./Dialog";
import { LibrarySection } from "./LibraryGrid";
import { useShowsData } from "./shows-data";
import { StatsSection } from "./Stats";
import { LoadError } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

// Usernames by id, so the panel can name the friend while their profile loads.
const seen = new Map<string, string>();

/** Opens a friend's profile (panel id "friend:<user id>"). */
export function useOpenFriend() {
  const { openPanel } = useAppView();
  return (person: Person) => {
    seen.set(person.id, person.username);
    openPanel(`friend:${person.id}`);
  };
}

/**
 * A friend's profile, read-only: their stats, what they're watching, what
 * they've completed and their favourites. A card opens the title's detail
 * panel on top, about the user's own library.
 */
export function FriendDialog({ id }: { id: string }) {
  const { closePanel } = useAppView();
  const headingId = useId();
  const { data: friend, error, errorStatus, retry } = useShowsData<FriendProfile>(`/friends/${id}`, false);
  const username = friend?.username ?? seen.get(id);
  const items = friend?.items ?? null;
  const section = (heading: string, status: "watching" | "completed" | null, empty: string) =>
    <LibrarySection heading={heading} label={heading} readOnly
      loadingLabel={`Loading ${heading.toLowerCase()}…`} empty={empty}
      items={items && items.filter((item) => status ? item.library.status === status : item.library.isFavourite)} />;

  return <Dialog className={`${styles.dialog} ${styles.friendDialog}`} aria-labelledby={headingId} onClose={closePanel}>
    <div className={styles.dialogBody}>
      <div className={styles.dialogHeader}>
        <h2 id={headingId}>{username ?? "Friend"}</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={closePanel}>×</button>
      </div>
      {error ? (errorStatus === 404 ? <p className={styles.empty}>{error}</p> : <LoadError message={error} onRetry={retry} />) : <>
        <StatsSection stats={friend?.stats ?? null} />
        {section("Watching", "watching", "Not watching anything right now.")}
        {section("Completed", "completed", "Nothing completed yet.")}
        {section("Favourites", null, "No favourites yet.")}
        <TmdbAttribution />
      </>}
    </div>
  </Dialog>;
}
