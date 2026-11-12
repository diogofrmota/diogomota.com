"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, SearchIcon } from "@/components/common/icons";
import {
  libraryStatuses, statusNames, titleKey, type FriendsState, type LibraryItem, type MediaType, type TitleSummary,
} from "@/lib/show-types";
import { AddFriend, requestSentText } from "./AddFriend";
import { AddMark, ProgressLine, StatusBadge, statusHints, statusIcons, StatusChooser, useTitleStatus } from "./AddToLibrary";
import { useLibrary } from "./library";
import { forgetShowsData, showsRequest, useDebounced, useShowsData } from "./shows-data";
import { cardSizes, LoadError, Poster, SkeletonGrid, titleFacts } from "./TitleGrid";
import { TmdbAttribution } from "./TmdbAttribution";
import styles from "./Shows.module.css";

// The guide's steps: TV shows, then movies (the titles to pick from are what's
// trending and popular, or a search), then friends. Then a last screen with
// what was added.
type TitlesStep = { kind: "titles"; type: MediaType; label: string; heading: string; lead: string };
type Step = TitlesStep | { kind: "friends"; label: string; heading: string; lead: string };
const steps: Step[] = [
  {
    kind: "titles", type: "tv", label: "TV shows", heading: "Which TV shows do you watch?",
    lead: "Tap a poster, then pick where it goes. Search if yours isn’t here.",
  },
  {
    kind: "titles", type: "movie", label: "Movies", heading: "And which movies?",
    lead: "The same for movies: tap a poster, then pick where it goes.",
  },
  {
    kind: "friends", label: "Friends", heading: "Watch together",
    lead: "Add your friends to see what they’re watching and what they’ve finished, and their titles show up in Discover.",
  },
];

const debounceMs = 300;
const kindOf = (type: MediaType, count = 2) => type === "tv" ? count === 1 ? "TV show" : "TV shows" : count === 1 ? "movie" : "movies";

// A title to pick: a tap on its poster opens the status chooser over it
// (StatusChooser); its status again takes it out. Once added, the poster is
// outlined, the + at its corner is a tick, and its status is under it.
function PickCard({ title, index, withType }: { title: TitleSummary; index: number; withType: boolean }) {
  const status = useTitleStatus(title, { toggle: true });
  const [choosing, setChoosing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const { item, busy } = status;
  const facts = titleFacts(title, withType);
  const added = item && statusNames[item.library.status];
  // As in TitleGrid: the button is the poster and title, and covers the line
  // under them too; its label says that line in words, after the title.
  return <li className={styles.cardItem} style={{ "--i": index } as React.CSSProperties}>
    {/* Not disabled while adding: it keeps focus, which a choice hands back to it. */}
    <button ref={button} type="button" className={`${styles.card} ${styles.pick}`} data-status={item?.library.status} aria-busy={busy || undefined}
      aria-expanded={choosing} aria-label={added ? `${facts.label}, in your library as ${added}` : facts.label}
      onClick={() => { if (!busy) setChoosing(!choosing); }}>
      <Poster title={title} sizes={cardSizes} />
      <span className={styles.cardTitle}>{title.title}</span>
    </button>
    {status.error ? <span role="alert" className={styles.cardError}>{status.error}</span>
      : <span className={item ? styles.pickAdded : styles.cardMeta}>{busy ? "Adding…" : added || facts.text}</span>}
    <span className={styles.posterSpot}>
      {item && !choosing && <ProgressLine item={item} />}
      {item && item.library.status !== "planned" && !choosing && <StatusBadge status={item.library.status} />}
      {choosing ? <StatusChooser title={title} status={status} onClose={() => setChoosing(false)} returnFocus={() => button.current} />
        : <AddMark added={!!item} busy={busy} />}
    </span>
  </li>;
}

// What the statuses mean, over the posters.
function Legend() {
  return <ul className={styles.legend} aria-label="Where a title can go">
    {libraryStatuses.map((status) => {
      const Icon = statusIcons[status];
      return <li key={status} data-status={status}><Icon /><span><b>{statusNames[status]}</b> <span className={styles.legendHint}>{statusHints[status]}</span></span></li>;
    })}
  </ul>;
}

// Trending and popular titles of the step's type, without repeats; or what a
// search finds of that type.
function Titles({ step }: { step: TitlesStep }) {
  const [query, setQuery] = useState("");
  const text = query.trim().replace(/\s+/g, " ");
  const searched = useDebounced(text, debounceMs);
  const trending = useShowsData<TitleSummary[]>(searched ? null : `/discover/${step.type}/trending`);
  const popular = useShowsData<TitleSummary[]>(searched ? null : `/discover/${step.type}/popular`);
  const search = useShowsData<TitleSummary[]>(searched ? `/discover/search?q=${encodeURIComponent(searched)}` : null);
  const kind = kindOf(step.type);
  const label = searched ? `Results for “${searched}”` : `${step.label} to choose from`;
  const titles = searched ? search.data?.filter((title) => title.type === step.type)
    : trending.data && [...new Map([...trending.data, ...(popular.data ?? [])].map((title) => [titleKey(title), title])).values()];
  const loading = searched ? search.loading : trending.loading;
  const failed = searched ? search : trending.error ? trending : null;

  return <>
    <Legend />
    <form role="search" className={styles.pickSearch} onSubmit={(event) => event.preventDefault()}>
      <SearchIcon />
      <input type="search" aria-label={`Search for a ${kindOf(step.type, 1)}`} placeholder={`Search for a ${kindOf(step.type, 1)}`} value={query}
        maxLength={100} autoComplete="off" spellCheck={false} enterKeyHint="search" onChange={(event) => setQuery(event.target.value)} />
    </form>
    <div aria-busy={loading || text !== searched}>
      {loading || text !== searched ? <SkeletonGrid count={12} label={searched || text ? "Searching…" : `Loading ${kind}…`} />
        : failed?.error ? <LoadError message={failed.error} onRetry={failed.retry} />
        : !titles?.length ? <p className={styles.empty}>{searched ? `No ${kind} found for “${searched}”.` : `TMDB has no ${kind} here right now.`}</p>
        : <ul className={styles.grid} aria-label={label}>
          {titles.map((title, i) => <PickCard key={titleKey(title)} title={title} index={i} withType={false} />)}
        </ul>}
    </div>
  </>;
}

// The friends step: friend requests, with what each one did.
function Friends() {
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
    <AddFriend busy={busy} onAdd={add} />
    {notice && <p role={notice.error ? "alert" : "status"}
      className={notice.error ? `${styles.error} ${styles.notice}` : `${styles.notice} ${styles.success}`}>{notice.text}</p>}
  </div>;
}

// The end: a tick, what was added by status, and some of their posters.
function AllSet({ items, headingId, heading, onDone }: {
  items: readonly LibraryItem[]; headingId: string; heading: React.Ref<HTMLHeadingElement>; onDone: () => void;
}) {
  return <div className={styles.allSet}>
    <span className={styles.allSetMark} aria-hidden="true"><CheckIcon /></span>
    <h2 id={headingId} ref={heading} tabIndex={-1} className={styles.onboardingHeading}>You’re all set!</h2>
    <p className={styles.onboardingLead}>
      {items.length ? "Your library is ready. Keep track of each episode from your Watchlist." : "Your library is empty for now: add titles from Discover whenever you like."}
    </p>
    {items.length > 0 && <>
      <ul className={styles.allSetCounts} aria-label="In your library">
        {libraryStatuses.map((status) => {
          const Icon = statusIcons[status];
          const count = items.filter((item) => item.library.status === status).length;
          return <li key={status} data-status={status}><Icon /><b>{count}</b> {statusNames[status]}</li>;
        })}
      </ul>
      <ul className={styles.collage} aria-hidden="true">
        {items.slice(0, 8).map((item, i) => <li key={titleKey(item)} style={{ "--i": i } as React.CSSProperties}>
          <Poster title={item} sizes="96px" />
        </li>)}
      </ul>
    </>}
    <button type="button" className={`${styles.primary} ${styles.allSetButton}`} onClick={onDone}>Go to my library</button>
  </div>;
}

/**
 * The guide a new account (an empty library) gets on the Watchlist: their TV shows,
 * their movies, then their friends, and what they added. Skip ends it at any
 * step; either way `onDone` shows the Watchlist as it is. Each step slides in from the
 * side it's on (Shows.module.css): the next from the right, the one before from the left.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const library = useLibrary();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const moved = useRef(false);
  const finished = index === steps.length;
  const step = steps[Math.min(index, steps.length - 1)];
  const items = library.items ?? [];
  const ofType = step.kind === "titles" ? items.filter((item) => item.type === step.type).length : 0;

  // A new step: its heading takes focus (not on the first, which the page opened on).
  useEffect(() => { if (moved.current) heading.current?.focus({ preventScroll: true }); }, [index]);
  const go = (by: 1 | -1) => {
    moved.current = true;
    window.scrollTo({ top: 0 });
    setDirection(by > 0 ? "forward" : "back");
    setIndex((current) => Math.min(Math.max(current + by, 0), steps.length));
  };

  return <section className={styles.onboarding} aria-labelledby={headingId}>
    <div className={styles.onboardingTop}>
      <p className={styles.onboardingKicker}>{finished ? "Set up your library" : `Set up your library · Step ${index + 1} of ${steps.length}`}</p>
      {!finished && <button type="button" className={styles.textLink} onClick={onDone}>Skip</button>}
    </div>
    <ol className={styles.stepper} aria-hidden="true">
      {steps.map((s, i) => <li key={s.label} data-state={i < index ? "done" : i === index ? "current" : "next"}>
        <span className={styles.stepNumber}>{i < index ? <CheckIcon /> : i + 1}</span>
        <span className={styles.stepLabel}>{s.label}</span>
      </li>)}
    </ol>
    {/* Keyed: a new step is a new element, which slides in. */}
    <div key={index} className={styles.onboardingStep} data-direction={index > 0 || direction === "back" ? direction : undefined}>
      {finished ? <AllSet items={items} headingId={headingId} heading={heading} onDone={onDone} /> : <>
        <h2 id={headingId} ref={heading} tabIndex={-1} className={styles.onboardingHeading}>{step.heading}</h2>
        <p className={styles.onboardingLead}>{step.lead}</p>
        {/* Keyed, so each step starts with an empty search. */}
        {step.kind === "titles" ? <Titles key={index} step={step} /> : <Friends />}
      </>}
    </div>

    {!finished && <div className={styles.onboardingNav}>
      {index > 0 ? <button type="button" onClick={() => go(-1)}>Back</button> : <span />}
      <p className={styles.onboardingCount} aria-live="polite">
        {step.kind === "titles" && ofType ? `${ofType} ${kindOf(step.type, ofType)} added`
          : items.length ? `${items.length} title${items.length === 1 ? "" : "s"} in your library` : ""}
      </p>
      <button type="button" className={styles.primary} onClick={() => go(1)}>{index === steps.length - 1 ? "Finish" : "Next"}</button>
    </div>}
    {step.kind === "titles" && !finished && <TmdbAttribution />}
  </section>;
}
