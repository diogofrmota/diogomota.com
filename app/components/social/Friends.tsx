"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "@/components/common/icons";
import { PersonName } from "@/components/common/PersonName";
import { Button, Notice as NoticeText } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { UndoToast, useUndo } from "@/components/common/Undo";
import { ApiError } from "@/lib/api-request";
import type { FriendsState, Person } from "@/lib/social-types";
import Link from "next/link";
import { AddFriend, requestSentText } from "./AddFriend";
import { socialRequest } from "./social-data";
import { LoadError } from "../shows/TitleGrid";
import styles from "../shows/Shows.module.css";

// The user's friends and friend requests: loaded whenever Friends is shown
// (effects stop while a view is hidden) or the page becomes visible again, and
// replaced by the answer to every change. Requests go one at a time, in order.
function useFriends() {
  const [state, setState] = useState<FriendsState | null>(null);
  const [loadError, setLoadError] = useState("");
  const queue = useRef<Promise<unknown>>(null);
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
      void client.invalidateQueries({ queryKey: ["social"] });
    },
    [client],
  );
  const load = useCallback(
    () =>
      void enqueue(async () => {
        try {
          show(await socialRequest<FriendsState>("/friends"));
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
          const next = await socialRequest<FriendsState>(path, { method, body });
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
  return (
    <li>
      <div className={styles.personRow}>
        {/* The whole row opens their profile; "Check profile" on its right says so. */}
        <Link className={styles.personLink} href={`/social/profile/${person.id}`}>
          <Avatar username={person.username} name={person.name} url={person.avatarUrl} className={styles.avatar} />
          <PersonName person={person} className={styles.personName} />{" "}
          <span className={styles.checkProfile}>Check profile</span>
        </Link>
        <button type="button" className={styles.removeIcon} aria-label={`Remove ${person.username}`} onClick={onRemove}>
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

/** Friends, incoming requests, and search, now shared across apps. */
export function Friends() {
  const { state, loadError, load, send } = useFriends();
  const requestsId = useId();
  const sentId = useId();
  const friendsId = useId();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
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
      <h1 className={ui.heading}>Friends</h1>
      {(incoming.length > 0 || notice?.where === "requests") && (
        <section className={styles.section} aria-labelledby={requestsId}>
          <h2 id={requestsId}>Friend requests</h2>
          {notice?.where === "requests" && <NoticeLine notice={notice} />}
          {incoming.length > 0 && (
            <ul className={styles.people} aria-labelledby={requestsId}>
              {incoming.map((person) => (
                <li key={person.id} className={styles.personRow}>
                  <Avatar
                    username={person.username}
                    name={person.name}
                    url={person.avatarUrl}
                    className={styles.avatar}
                  />
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
                      <Avatar
                        username={person.username}
                        name={person.name}
                        url={person.avatarUrl}
                        className={styles.avatar}
                      />
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
