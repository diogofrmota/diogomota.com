"use client";
import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon } from "@/components/common/icons";
import {
  statusNames, titleKey, type DiscoverSection, type FriendsState, type LibraryItem, type MediaType, type TitleSummary,
} from "@/lib/show-types";
import { AddFriend, requestSentText } from "./AddFriend";
import { TypeSwitch } from "./Discover";
import { useLibrary } from "./library";
import { forgetShowsData, showsRequest, useDebounced, useShowsData } from "./shows-data";
import { cardSizes, LoadError, Poster, SkeletonGrid, titleFacts } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

// The guide's steps: two of picking titles from one of Discover's lists (or a
// search), each added with its status, then one of adding friends.
type PickStep = { kind: "pick"; heading: string; lead: string; section: DiscoverSection; listName: string; status: "watching" | "planned" };
type Step = PickStep | { kind: "friends"; heading: string; lead: string };
const steps: Step[] = [
  {
    kind: "pick", heading: "What are you watching right now?", section: "trending", listName: "Trending this week", status: "watching",
    lead: "Tap the shows and movies you’re in the middle of: they go into Watching. Here’s what’s trending this week, or search for yours.",
  },
  {
    kind: "pick", heading: "What do you want to watch next?", section: "popular", listName: "Popular right now", status: "planned",
    lead: "Tap the ones you’d like to start: they go into Planned. These are the most popular right now.",
  },
  {
    kind: "friends", heading: "Watch together",
    lead: "Add your friends to see what they’re watching and what they rate, and their titles show up in Discover.",
  },
];

const debounceMs = 300;

// Titles to pick from, as poster cards that add a title with one tap (with
// the step's status) and take it out again with another.
function PickGrid({ titles, label, status, withType = false, onError }: {
  titles: readonly TitleSummary[]; label: string; status: PickStep["status"]; withType?: boolean; onError: (message: string) => void;
}) {
  const library = useLibrary();
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());

  async function toggle(title: TitleSummary, item: LibraryItem | undefined) {
    if (item) return library.remove(title);
    const key = titleKey(title);
    setAdding((keys) => new Set(keys).add(key));
    try {
      await library.add(title, status);
      onError("");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setAdding((keys) => { const next = new Set(keys); next.delete(key); return next; });
    }
  }

  return <ul className={styles.grid} aria-label={label}>
    {titles.map((title) => {
      const key = titleKey(title);
      const item = library.find(title);
      const busy = adding.has(key);
      const facts = titleFacts(title, withType);
      const added = item && statusNames[item.library.status];
      // As in TitleGrid: the button is the poster and title, and covers the
      // line under them too; its label says that line in words, after the title.
      return <li key={key} className={styles.cardItem}>
        <button type="button" className={`${styles.card} ${styles.pick}`} aria-pressed={!!item} disabled={busy}
          aria-label={added ? `${facts.label}, in your library as ${added}` : facts.label} onClick={() => toggle(title, item)}>
          <Poster title={title} sizes={cardSizes} />
          <span className={styles.cardTitle}>{title.title}</span>
        </button>
        {/* Over the poster's corner, outside the button: its text isn't the button's. */}
        <span className={styles.pickMark} data-added={!!item} aria-hidden="true">{busy ? "…" : item ? "✓" : "+"}</span>
        <span className={item ? styles.pickAdded : styles.cardMeta}>{busy ? "Adding…" : added ? `✓ ${added}` : facts.text}</span>
      </li>;
    })}
  </ul>;
}

// A step of picking titles: the step's list for TV shows or movies, or what a search finds.
function Pick({ step }: { step: PickStep }) {
  const [type, setType] = useState<MediaType>("tv");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const text = query.trim().replace(/\s+/g, " ");
  const searched = useDebounced(text, debounceMs);
  const list = useShowsData<TitleSummary[]>(searched ? null : `/discover/${type}/${step.section}`);
  const search = useShowsData<TitleSummary[]>(searched ? `/discover/search?q=${encodeURIComponent(searched)}` : null);
  const shown = searched ? search : list;
  const kind = type === "tv" ? "TV shows" : "movies";
  const label = searched ? `Results for “${searched}”` : `${step.listName}: ${kind}`;

  return <>
    <div className={styles.pickTools}>
      <TypeSwitch type={type} onChange={setType} />
      <form role="search" className={styles.pickSearch} onSubmit={(event) => event.preventDefault()}>
        <SearchIcon />
        <input type="search" aria-label="Search for a TV show or movie" placeholder="Search for a title" value={query}
          maxLength={100} autoComplete="off" spellCheck={false} enterKeyHint="search" onChange={(event) => setQuery(event.target.value)} />
      </form>
    </div>
    {error && <p role="alert" className={`${styles.error} ${styles.viewError}`}>{error}</p>}
    <div aria-busy={shown.loading || text !== searched}>
      {shown.loading || text !== searched ? <SkeletonGrid count={12} label={searched || text ? "Searching…" : `Loading ${kind}…`} />
        : shown.error ? <LoadError message={shown.error} onRetry={shown.retry} />
        : !shown.data?.length ? <p className={styles.empty}>{searched ? `No TV shows or movies found for “${searched}”.` : `TMDB has no ${kind} here right now.`}</p>
        : <PickGrid titles={shown.data} label={label} status={step.status} withType={!!searched} onError={setError} />}
    </div>
  </>;
}

// The last step: friend requests, with what each one did.
function Friends({ username }: { username: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  async function add(value: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const next = await showsRequest<FriendsState>("/friends", { method: "POST", body: { username: value } });
      // Added by Friends in Discover loads again when next shown.
      forgetShowsData((path) => path.endsWith("/friends"));
      setNotice({ text: requestSentText(next, value) });
      return true;
    } catch (err) {
      setNotice({ text: (err as Error).message, error: true });
      return false;
    } finally { setBusy(false); }
  }

  return <div className={styles.onboardingFriends}>
    <AddFriend username={username} busy={busy} onAdd={add} />
    {notice && <p role={notice.error ? "alert" : "status"}
      className={notice.error ? `${styles.error} ${styles.notice}` : `${styles.notice} ${styles.success}`}>{notice.text}</p>}
  </div>;
}

/**
 * The guide a new account (an empty library) gets on Home: what they're
 * watching, what they want to watch, then their friends. Skip ends it at any
 * step, Done at the last; either way `onDone` shows Home as it is.
 */
export function Onboarding({ username, onDone }: { username: string; onDone: () => void }) {
  const library = useLibrary();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [index, setIndex] = useState(0);
  const moved = useRef(false);
  const step = steps[index];
  const last = index === steps.length - 1;
  const added = library.items?.length ?? 0;

  // A new step: its heading takes focus (not on the first, which the page opened on).
  useEffect(() => { if (moved.current) heading.current?.focus(); }, [index]);
  const go = (next: number) => { moved.current = true; setIndex(next); };

  return <section className={styles.onboarding} aria-labelledby={headingId}>
    <div className={styles.onboardingTop}>
      <p className={styles.onboardingKicker}>Set up your library · Step {index + 1} of {steps.length}</p>
      <button type="button" className={styles.textLink} onClick={onDone}>Skip</button>
    </div>
    <ol className={styles.stepDots} aria-hidden="true">
      {steps.map((s, i) => <li key={s.heading} data-state={i < index ? "done" : i === index ? "current" : "next"} />)}
    </ol>
    <h2 id={headingId} ref={heading} tabIndex={-1} className={styles.onboardingHeading}>{step.heading}</h2>
    <p className={styles.onboardingLead}>{step.lead}</p>

    {/* Keyed, so each step starts with TV shows and an empty search. */}
    {step.kind === "pick" ? <Pick key={index} step={step} /> : <Friends username={username} />}

    <div className={styles.onboardingNav}>
      {index > 0 ? <button type="button" onClick={() => go(index - 1)}>Back</button> : <span />}
      <p className={styles.onboardingCount} aria-live="polite">
        {added ? `${added} title${added === 1 ? "" : "s"} in your library` : ""}
      </p>
      {last ? <button type="button" className={styles.primary} onClick={onDone}>Done</button>
        : <button type="button" className={styles.primary} onClick={() => go(index + 1)}>Next</button>}
    </div>
    {step.kind === "pick" && <TmdbAttribution />}
  </section>;
}
