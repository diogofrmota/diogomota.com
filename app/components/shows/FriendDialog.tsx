"use client";
import { useId } from "react";
import { Avatar } from "@/components/common/Avatar";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon } from "@/components/common/icons";
import { PersonName } from "@/components/common/PersonName";
import { useAppView } from "@/hooks/useAppView";
import type { FriendProfile, Person } from "@/lib/show-types";
import { LibrarySection } from "./LibraryGrid";
import { useOpenTitle, useShowsData } from "./shows-data";
import { StatsSection } from "./Stats";
import { LoadError, TitleRow } from "./TitleGrid";
import styles from "./Shows.module.css";

// People by id, so the panel can name (and show) the friend while their profile loads.
const seen = new Map<string, Person>();

/** Opens a friend's profile (panel id "friend:<user id>"). */
export function useOpenFriend() {
  const { openPanel } = useAppView();
  return (person: Person) => {
    seen.set(person.id, person);
    openPanel(`friend:${person.id}`);
  };
}

/**
 * A friend's profile, read-only: their stats, what they're watching, what
 * they've completed, their favourites, and what you have both planned. A card opens the title's detail
 * panel on top, about the user's own library.
 */
export function FriendDialog({ id }: { id: string }) {
  const { closePanel } = useAppView();
  const headingId = useId();
  const togetherId = useId();
  const openTitle = useOpenTitle();
  const { data: friend, error, errorStatus, retry } = useShowsData<FriendProfile>(`/friends/${id}`, false);
  const person = friend ?? seen.get(id);
  const items = friend?.items ?? null;
  // Each poster says its status (LibraryGrid): Favourites mixes them.
  const section = (heading: string, status: "watching" | "completed" | null, empty: string) => (
    <LibrarySection
      heading={heading}
      label={heading}
      readOnly
      loadingLabel={`Loading ${heading.toLowerCase()}…`}
      empty={empty}
      items={items && items.filter((item) => (status ? item.library.status === status : item.library.isFavourite))}
    />
  );

  return (
    <Dialog className={`${styles.dialog} ${styles.friendDialog}`} aria-labelledby={headingId} onClose={closePanel}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <div className={styles.friendHeading}>
            {person && <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />}
            <h2 id={headingId}>{person ? <PersonName person={person} /> : "Friend"}</h2>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={closePanel}>
            <CloseIcon />
          </button>
        </div>
        {error ? (
          errorStatus === 404 ? (
            <p className={styles.empty}>{error}</p>
          ) : (
            <LoadError message={error} onRetry={retry} />
          )
        ) : (
          <>
            <StatsSection stats={friend?.stats ?? null} />
            {section("Watching", "watching", "Not watching anything right now.")}
            {section("Completed", "completed", "Nothing completed yet.")}
            {section("Favourites", null, "No favourites yet.")}
            {/* What you could watch together: you've both planned it. */}
            {!!friend?.bothPlanned.length && (
              <section className={styles.section} aria-labelledby={togetherId}>
                <h2 id={togetherId}>You both want to watch</h2>
                <TitleRow titles={friend.bothPlanned} label="You both want to watch" onOpen={openTitle} />
              </section>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
