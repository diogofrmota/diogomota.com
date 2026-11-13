"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityFeed } from "@/components/common/ActivityFeed";
import { TrashIcon } from "@/components/common/icons";
import { PersonName } from "@/components/common/PersonName";
import { Button, Notice as NoticeText } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { UndoToast, useUndo } from "@/components/common/Undo";
import type { ActivityItem } from "@/lib/activity-types";
import { ApiError } from "@/lib/api-request";
import type { Named } from "@/lib/names";
import { libraryStats, type FriendsState, type Person } from "@/lib/show-types";
import { AddFriend, requestSentText } from "./AddFriend";
import { useOpenFriend } from "./FriendDialog";
import { ChangeError, useLibrary } from "./library";
import { LibrarySection } from "./LibraryGrid";
import { forgetShowsData, showsRequest, useOpenTitle, useShowsData } from "./shows-data";
import { StatsSection } from "./Stats";
import { LoadError } from "./TitleGrid";
import styles from "./Shows.module.css";

// The user's friends and friend requests: loaded whenever Profile is shown
// (effects stop while a view is hidden) or the page becomes visible again, and
// replaced by the answer to every change. Requests go one at a time, in order.
function useFriends() {
  const [state, setState] = useState<FriendsState | null>(null);
  const [loadError, setLoadError] = useState("");
  const queue = useRef<Promise<unknown>>(null);
  const friendIds = useRef<string | null>(null);
  const client = useQueryClient();

  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = (queue.current ?? Promise.resolve()).then(job);
    queue.current = run.catch(() => {});
    return run;
  }, []);
  const show = useCallback(
    (next: FriendsState) => {
      setState(next);
      setLoadError("");
      // Added by Friends in Discover lists their titles: it loads again when next shown.
      const ids = next.friends.map((friend) => friend.id).join();
      if (ids !== friendIds.current)
        forgetShowsData(client, (path) => path.endsWith("/friends") || path === "/activity");
      friendIds.current = ids;
    },
    [client],
  );
  const load = useCallback(
    () =>
      void enqueue(async () => {
        try {
          show(await showsRequest<FriendsState>("/friends"));
        } catch (err) {
          setLoadError((err as Error).message);
        }
      }),
    [enqueue, show],
  );
  /** Sends a change and returns the new state, or rejects with the server's error. */
  const send = useCallback(
    (path: string, method: string, body?: object) =>
      enqueue(async () => {
        try {
          const next = await showsRequest<FriendsState>(path, { method, body });
          show(next);
          return next;
        } catch (err) {
          // Changed meanwhile (by them, or in another tab): show what is there now.
          if (err instanceof ApiError && [404, 409].includes(err.status)) load();
          throw err;
        }
      }),
    [enqueue, show, load],
  );

  useEffect(() => {
    load();
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  return { state, loadError, load, send };
}

// What the last friend action did, or why it was refused, shown in the section
// it was made in. Focus moves to it when the button pressed went away with its row.
type Notice = { where: "requests" | "friends"; text: string; error?: boolean; focus?: boolean };

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <NoticeText error={notice.error} focus={notice.focus} className={styles.notice}>
      {notice.text}
    </NoticeText>
  );
}

function FriendRow({ person, onRemove }: { person: Person; onRemove: () => void }) {
  const openFriend = useOpenFriend();
  return (
    <li>
      <div className={styles.personRow}>
        {/* The whole row opens their profile; "Check profile" on its right says so. */}
        <button type="button" className={styles.personLink} onClick={() => openFriend(person)}>
          <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />
          <PersonName person={person} className={styles.personName} />{" "}
          <span className={styles.checkProfile}>Check profile</span>
        </button>
        <button type="button" className={styles.removeIcon} aria-label={`Remove ${person.username}`} onClick={onRemove}>
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

/** What the user's friends did lately in Shows: started, finished, loved or recommended a title. */
function FriendsActivity() {
  const id = useId();
  const openTitle = useOpenTitle();
  const { data, error, loading, retry } = useShowsData<ActivityItem[]>("/activity", false);
  return (
    <section className={styles.section} aria-labelledby={id} aria-busy={loading}>
      <h2 id={id}>Friends&rsquo; activity</h2>
      {loading ? (
        <p role="status" className={ui.muted}>
          Loading…
        </p>
      ) : error ? (
        <LoadError message={error} onRetry={retry} />
      ) : (
        <ActivityFeed
          items={data ?? []}
          empty="Nothing yet: what your friends start, finish and love shows up here."
          onOpenTitle={openTitle}
        />
      )}
    </section>
  );
}

/**
 * The Profile view, one column in the middle of the page: whose it is (their
 * picture, name and @username), friend requests, stats, favourites and friends.
 */
export function Profile({ user }: { user: Named & { avatarUrl: string | null } }) {
  const { username, name, avatarUrl } = user;
  const library = useLibrary();
  const { state, loadError, load, send } = useFriends();
  const requestsId = useId();
  const sentId = useId();
  const friendsId = useId();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const items = library.items;
  // A friend removed, until their Undo goes (only then is it sent).
  const undo = useUndo();
  const removing = undo.pending?.id;

  // Runs a friend action; `job` returns what to say once it's done.
  async function run(where: Notice["where"], focus: boolean, job: () => Promise<string>): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ where, text: await job(), focus });
      return true;
    } catch (err) {
      setNotice({ where, text: (err as Error).message, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const act = (where: Notice["where"], path: string, method: "POST" | "DELETE", done: string) =>
    run(where, true, async () => {
      await send(path, method, method === "POST" ? {} : undefined);
      return done;
    });
  const addFriend = (value: string) =>
    run("friends", false, async () => {
      return requestSentText(await send("/friends", "POST", { username: value }), value);
    });

  const incoming = state?.incoming ?? [];
  return (
    <div className={`${styles.view} ${styles.profile}`}>
      {/* The Profile tab in the top bar shows which view this is; the page shows whose. */}
      <h1 className={ui.srOnly}>Profile</h1>
      <div className={styles.profileHeader}>
        <Avatar username={username} url={avatarUrl} className={`${styles.avatar} ${styles.profileAvatar}`} />
        {name && <p className={styles.profileName}>{name}</p>}
        <p className={name ? styles.profileUsername : styles.profileName}>@{username}</p>
      </div>
      <ChangeError className={styles.viewError} />

      {(incoming.length > 0 || notice?.where === "requests") && (
        <section className={styles.section} aria-labelledby={requestsId}>
          <h2 id={requestsId}>Friend requests</h2>
          {notice?.where === "requests" && <NoticeLine notice={notice} />}
          {incoming.length > 0 && (
            <ul className={styles.people} aria-labelledby={requestsId}>
              {incoming.map((person) => (
                <li key={person.id} className={styles.personRow}>
                  <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />
                  <PersonName person={person} className={styles.personName} />
                  <span className={styles.personActions}>
                    <Button
                      variant="primary"
                      disabled={busy}
                      aria-label={`Accept ${person.username}`}
                      onClick={() =>
                        act(
                          "requests",
                          `/friends/${person.id}/accept`,
                          "POST",
                          `You and ${person.username} are now friends.`,
                        )
                      }
                    >
                      Accept
                    </Button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Decline ${person.username}`}
                      onClick={() =>
                        act(
                          "requests",
                          `/friends/${person.id}/decline`,
                          "POST",
                          `Declined ${person.username}'s friend request.`,
                        )
                      }
                    >
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {library.loadError && (
        <div className={styles.section}>
          <LoadError message={library.loadError} onRetry={library.reload} />
        </div>
      )}
      {/* A library kept from before stays shown under the error. */}
      {(items || !library.loadError) && (
        <>
          <StatsSection stats={items && libraryStats(items)} />
          <LibrarySection
            heading="Favourites"
            label="Your favourites"
            loadingLabel="Loading your favourites…"
            items={items && items.filter((item) => item.library.isFavourite)}
            empty="No favourites yet. Open a title in your library and tap Favourite."
          />
        </>
      )}

      <FriendsActivity />

      <section className={styles.section} aria-labelledby={friendsId} aria-busy={!state && !loadError}>
        <div className={styles.sectionHeader}>
          <h2 id={friendsId}>Friends</h2>
          {!!state?.friends.length && (
            <span className={styles.count} aria-hidden="true">
              {state.friends.length}
            </span>
          )}
        </div>
        <AddFriend busy={busy} onAdd={addFriend} />
        {notice?.where === "friends" && <NoticeLine notice={notice} />}
        {!state ? (
          loadError ? (
            <LoadError message={loadError} onRetry={load} />
          ) : (
            <div className={styles.people}>
              <p role="status" className={ui.srOnly}>
                Loading your friends…
              </p>
              {[1, 2].map((line) => (
                <span key={line} className={`${styles.skeletonLine} ${styles.skeleton}`} />
              ))}
            </div>
          )
        ) : (
          <>
            {state.friends.some((person) => person.id !== removing) ? (
              <ul className={styles.people} aria-label="Your friends">
                {state.friends
                  .filter((person) => person.id !== removing)
                  .map((person) => (
                    <FriendRow
                      key={person.id}
                      person={person}
                      onRemove={() =>
                        undo.schedule({
                          id: person.id,
                          label: `Removed ${person.name ?? person.username} from your friends`,
                          commit: () =>
                            void act(
                              "friends",
                              `/friends/${person.id}`,
                              "DELETE",
                              `Removed ${person.username} from your friends.`,
                            ),
                        })
                      }
                    />
                  ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                No friends yet. Search for one by their name or username to see each other&rsquo;s libraries.
              </p>
            )}
            {state.outgoing.length > 0 && (
              <>
                <h3 id={sentId} className={styles.subheading}>
                  Sent requests
                </h3>
                <ul className={styles.people} aria-labelledby={sentId}>
                  {state.outgoing.map((person) => (
                    <li key={person.id} className={styles.personRow}>
                      <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />
                      <PersonName person={person} className={styles.personName} />
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Cancel request to ${person.username}`}
                        onClick={() =>
                          act(
                            "friends",
                            `/friends/${person.id}/cancel`,
                            "POST",
                            `Cancelled your friend request to ${person.username}.`,
                          )
                        }
                      >
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
      <UndoToast undo={undo} />
    </div>
  );
}
