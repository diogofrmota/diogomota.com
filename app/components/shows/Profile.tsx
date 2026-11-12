"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { ChevronRightIcon } from "@/components/common/icons";
import { ApiError } from "@/lib/api-request";
import { libraryStats, type FriendsState, type Person } from "@/lib/show-types";
import { AddFriend, requestSentText } from "./AddFriend";
import { useOpenFriend } from "./FriendDialog";
import { ChangeError, useLibrary } from "./library";
import { LibrarySection } from "./LibraryGrid";
import { forgetShowsData, showsRequest } from "./shows-data";
import { StatsSection } from "./Stats";
import { LoadError } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

// The user's friends and friend requests: loaded whenever Profile is shown
// (effects stop while a view is hidden) or the page becomes visible again, and
// replaced by the answer to every change. Requests go one at a time, in order.
function useFriends() {
  const [state, setState] = useState<FriendsState | null>(null);
  const [loadError, setLoadError] = useState("");
  const queue = useRef<Promise<unknown>>(null);
  const friendIds = useRef<string | null>(null);

  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = (queue.current ?? Promise.resolve()).then(job);
    queue.current = run.catch(() => {});
    return run;
  }, []);
  const show = useCallback((next: FriendsState) => {
    setState(next);
    setLoadError("");
    // Added by Friends in Discover lists their titles: it loads again when next shown.
    const ids = next.friends.map((friend) => friend.id).join();
    if (ids !== friendIds.current) forgetShowsData((path) => path.endsWith("/friends"));
    friendIds.current = ids;
  }, []);
  const load = useCallback(() => void enqueue(async () => {
    try { show(await showsRequest<FriendsState>("/friends")); }
    catch (err) { setLoadError((err as Error).message); }
  }), [enqueue, show]);
  /** Sends a change and returns the new state, or rejects with the server's error. */
  const send = useCallback((path: string, method: string, body?: object) => enqueue(async () => {
    try {
      const next = await showsRequest<FriendsState>(path, { method, body });
      show(next);
      return next;
    } catch (err) {
      // Changed meanwhile (by them, or in another tab): show what is there now.
      if (err instanceof ApiError && [404, 409].includes(err.status)) load();
      throw err;
    }
  }), [enqueue, show, load]);

  useEffect(() => {
    load();
    const onShow = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);

  return { state, loadError, load, send };
}

// What the last friend action did, or why it was refused, shown in the section
// it was made in. Focus moves to it when the button pressed went away with its row.
type Notice = { where: "requests" | "friends"; text: string; error?: boolean; focus?: boolean };

function NoticeLine({ notice }: { notice: Notice }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (notice.focus) ref.current?.focus(); }, [notice]);
  return <p ref={ref} tabIndex={-1} role={notice.error ? "alert" : "status"}
    className={notice.error ? `${styles.error} ${styles.notice}` : `${styles.notice} ${styles.success}`}>{notice.text}</p>;
}

function FriendRow({ person, busy, onRemove }: { person: Person; busy: boolean; onRemove: () => void }) {
  const openFriend = useOpenFriend();
  const confirmId = useId();
  const removeButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  return <li>
    <div className={styles.personRow}>
      <button type="button" className={styles.personLink} onClick={() => openFriend(person)}>
        <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />
        <span className={styles.personName}>{person.username}</span>
        <span className={styles.chevron} aria-hidden="true"><ChevronRightIcon /></span>
      </button>
      <button ref={removeButton} type="button" className={styles.remove} aria-label={`Remove ${person.username}`}
        aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>Remove</button>
    </div>
    {confirming && <div className={styles.confirm} role="group" aria-labelledby={confirmId}>
      <p id={confirmId}>Remove {person.username} from your friends? You&rsquo;ll stop seeing each other&rsquo;s libraries.</p>
      <div className={styles.offerButtons}>
        <button type="button" className={styles.danger} disabled={busy} onClick={onRemove}>Remove</button>
        <button type="button" onClick={() => { setConfirming(false); removeButton.current?.focus(); }}>Cancel</button>
      </div>
    </div>}
  </li>;
}

/**
 * The Profile view, one column in the middle of the page: whose it is (their
 * picture and username), friend requests, stats, favourites and friends.
 */
export function Profile({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  const library = useLibrary();
  const { state, loadError, load, send } = useFriends();
  const requestsId = useId();
  const sentId = useId();
  const friendsId = useId();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const items = library.items;

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
    } finally { setBusy(false); }
  }
  const act = (where: Notice["where"], path: string, method: "POST" | "DELETE", done: string) =>
    run(where, true, async () => { await send(path, method, method === "POST" ? {} : undefined); return done; });
  const addFriend = (value: string) => run("friends", false, async () => {
    return requestSentText(await send("/friends", "POST", { username: value }), value);
  });

  const incoming = state?.incoming ?? [];
  return <div className={`${styles.view} ${styles.profile}`}>
    {/* The Profile tab in the top bar shows which view this is; the page shows whose. */}
    <h1 className={styles.srOnly}>Profile</h1>
    <div className={styles.profileHeader}>
      <Avatar username={username} url={avatarUrl} className={`${styles.avatar} ${styles.profileAvatar}`} />
      <p className={styles.profileName}>{username}</p>
    </div>
    <ChangeError className={`${styles.error} ${styles.viewError}`} />

    {(incoming.length > 0 || notice?.where === "requests") && <section className={styles.section} aria-labelledby={requestsId}>
      <h2 id={requestsId}>Friend requests</h2>
      {notice?.where === "requests" && <NoticeLine notice={notice} />}
      {incoming.length > 0 && <ul className={styles.people} aria-labelledby={requestsId}>
        {incoming.map((person) => <li key={person.id} className={styles.personRow}>
          <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />
          <span className={styles.personName}>{person.username}</span>
          <span className={styles.personActions}>
            <button type="button" className={styles.primary} disabled={busy} aria-label={`Accept ${person.username}`}
              onClick={() => act("requests", `/friends/${person.id}/accept`, "POST", `You and ${person.username} are now friends.`)}>Accept</button>
            <button type="button" disabled={busy} aria-label={`Decline ${person.username}`}
              onClick={() => act("requests", `/friends/${person.id}/decline`, "POST", `Declined ${person.username}'s friend request.`)}>Decline</button>
          </span>
        </li>)}
      </ul>}
    </section>}

    {!items && library.loadError ? <div className={styles.section}><LoadError message={library.loadError} onRetry={library.reload} /></div> : <>
      <StatsSection stats={items && libraryStats(items)} />
      <LibrarySection heading="Favourites" label="Your favourites" loadingLabel="Loading your favourites…"
        items={items && items.filter((item) => item.library.isFavourite)}
        empty="No favourites yet. Open a title in your library and tap Favourite." />
    </>}

    <section className={styles.section} aria-labelledby={friendsId} aria-busy={!state && !loadError}>
      <div className={styles.sectionHeader}>
        <h2 id={friendsId}>Friends</h2>
        {!!state?.friends.length && <span className={styles.count} aria-hidden="true">{state.friends.length}</span>}
      </div>
      <AddFriend username={username} busy={busy} onAdd={addFriend} />
      {notice?.where === "friends" && <NoticeLine notice={notice} />}
      {!state ? (loadError ? <LoadError message={loadError} onRetry={load} /> : <div className={styles.people}>
        <p role="status" className={styles.srOnly}>Loading your friends…</p>
        {[1, 2].map((line) => <span key={line} className={`${styles.skeletonLine} ${styles.skeleton}`} />)}
      </div>) : <>
        {state.friends.length ? <ul className={styles.people} aria-label="Your friends">
          {state.friends.map((person) => <FriendRow key={person.id} person={person} busy={busy}
            onRemove={() => act("friends", `/friends/${person.id}`, "DELETE", `Removed ${person.username} from your friends.`)} />)}
        </ul> : <p className={styles.empty}>No friends yet. Add one by their username to see each other&rsquo;s libraries.</p>}
        {state.outgoing.length > 0 && <>
          <h3 id={sentId} className={styles.subheading}>Sent requests</h3>
          <ul className={styles.people} aria-labelledby={sentId}>
            {state.outgoing.map((person) => <li key={person.id} className={styles.personRow}>
              <Avatar username={person.username} url={person.avatarUrl} className={styles.avatar} />
              <span className={styles.personName}>{person.username}</span>
              <button type="button" disabled={busy} aria-label={`Cancel request to ${person.username}`}
                onClick={() => act("friends", `/friends/${person.id}/cancel`, "POST", `Cancelled your friend request to ${person.username}.`)}>Cancel</button>
            </li>)}
          </ul>
        </>}
      </>}
    </section>
    {/* Like the Watchlist: once there are TMDB posters and runtimes to credit. */}
    {!!items?.length && <TmdbAttribution />}
  </div>;
}
