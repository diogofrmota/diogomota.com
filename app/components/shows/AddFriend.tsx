"use client";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useEffect, useId, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { CheckIcon } from "@/components/common/icons";
import { PersonName } from "@/components/common/PersonName";
import { NAME_MAX, usernameHint, USERNAME_MAX } from "@/lib/account-rules";
import type { FriendsState, PeopleSearch, PersonMatch } from "@/lib/show-types";
import { showsRequest, useDebounced } from "./shows-data";
import styles from "./Shows.module.css";

// Suggestions are asked for once typing pauses this long, from 2 characters
// to a name's length (lib/friends.ts, searchPeople).
const debounceMs = 200;
const searchMin = 2;
const searchMax = NAME_MAX;

const relationNames: Record<PersonMatch["relation"], string> = {
  none: "",
  friend: "Friends",
  incoming: "Sent you a request",
  outgoing: "Request sent",
};

// "@Bob " is bob: usernames are lowercase, and the @ is optional.
const normalize = (value: string) => value.trim().replace(/^@/, "").toLowerCase();
const isUsername = (text: string) => text.length <= USERNAME_MAX && /^[a-z0-9_]+$/.test(text);
// Lowercase and without accents, as the server compares names.
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Whether `match` is one the search for `typed` would find (searchPeople's rule). */
function fits(match: PersonMatch, typed: string): boolean {
  const handle = typed.startsWith("@");
  const text = fold(handle ? typed.slice(1) : typed);
  if (match.username.startsWith(text)) return true;
  // The name, or a word in it ("mota" fits "Diogo Mota").
  const name = match.name ? fold(match.name) : null;
  return !handle && !!name && (name.startsWith(text) || name.includes(` ${text}`));
}

/** What a friend request to `value` did, from the friends and requests the server answered with. */
export function requestSentText(next: FriendsState, value: string): string {
  const name = normalize(value);
  // They had already sent the user a request: now accepted.
  return next.friends.some((friend) => friend.username === name)
    ? `${name} had already sent you a request: you're now friends.`
    : `Friend request sent to ${name}.`;
}

// What the field says about what's typed, under it, once the search for it is
// back: whether an account has exactly that username, or that nobody fits it.
function checkText(typed: string, search: PeopleSearch | null): { text: string; found?: boolean } | null {
  const text = normalize(typed);
  if (typed.startsWith("@") && text && !isUsername(text))
    return { text: `Usernames have ${usernameHint}`, found: false };
  if (text.length < searchMin) return null;
  if (!search) return { text: "Searching…" };
  if (search.self) return { text: "That's your own username.", found: false };
  if (search.exact) {
    const exact = search.matches.find((match) => match.username === text);
    const relation = exact && exact.relation !== "none" ? ` · ${relationNames[exact.relation]}` : "";
    return { text: `${text} has an account${relation}`, found: true };
  }
  if (search.matches.length) return null;
  return { text: `No one found for “${typed.replace(/^@/, "")}”.`, found: false };
}

/**
 * Add a friend: a search field (named for screen readers only) that suggests
 * the people whose username or name starts with what's typed, in a list under
 * it (a combobox: arrows and Enter, or a tap, pick one, which puts their
 * username in the field), and says whether an account has exactly that
 * username. Send request asks the one typed or picked; with a name typed, the
 * one person it found. `onAdd` sends the request, and says whether it went
 * (the field empties).
 */
export function AddFriend({ busy, onAdd }: { busy: boolean; onAdd: (username: string) => Promise<boolean> }) {
  const inputId = useId();
  const checkId = useId();
  const listId = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; data: PeopleSearch } | null>(null);
  const [searchError, setSearchError] = useState("");
  // Send request with a name that fits several people.
  const [pickOne, setPickOne] = useState(false);

  const typed = value.trim().replace(/\s+/g, " ");
  const bare = typed.replace(/^@/, "");
  const searchable =
    bare.length >= searchMin && bare.length <= searchMax && (!typed.startsWith("@") || isUsername(bare.toLowerCase()));
  const query = useDebounced(searchable ? typed : "", debounceMs);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    showsRequest<PeopleSearch>(`/friends/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((data) => {
        setResult({ query, data });
        setSearchError("");
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setSearchError(error.message);
      });
    return () => controller.abort();
  }, [query]);

  // The last answer's people who still fit what's typed, while the next one loads.
  const suggestions =
    searchable && result && fold(typed).startsWith(fold(result.query))
      ? result.data.matches.filter((match) => fits(match, typed))
      : [];
  const current = result?.query === typed ? result.data : null;
  const check = pickOne
    ? { text: "Choose someone from the list.", found: false }
    : searchError && searchable
      ? { text: searchError, found: false }
      : checkText(typed, current);
  const expanded = open && suggestions.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  function choose(match: PersonMatch) {
    setValue(match.username);
    setOpen(false);
    setActive(-1);
    setPickOne(false);
  }

  // Who Send request asks: the username typed, if it is one someone has (or
  // the search isn't back to say); else the only person the search found.
  function recipient(): string | null {
    const username = normalize(value);
    if (current?.exact || suggestions.some((match) => match.username === username)) return username;
    if (suggestions.length === 1) return suggestions[0].username;
    if (suggestions.length > 1) return null;
    return value;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      // Round and round the list; the first press starts at its top or bottom.
      const last = suggestions.length - 1;
      setActive((index) =>
        event.key === "ArrowDown"
          ? index >= 0 && index < last
            ? index + 1
            : 0
          : index > 0 && index <= last
            ? index - 1
            : last,
      );
    } else if (event.key === "Enter" && expanded && active >= 0 && active < suggestions.length) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form
      className={styles.addFriend}
      onSubmit={async (event) => {
        event.preventDefault();
        const to = recipient();
        if (to === null) {
          setPickOne(true);
          setOpen(true);
          return;
        }
        setOpen(false);
        setActive(-1);
        if (await onAdd(to)) setValue("");
      }}
    >
      <label htmlFor={inputId} className={ui.srOnly}>
        Add a friend
      </label>
      <div className={styles.addFriendRow}>
        <div className={styles.combo}>
          <input
            id={inputId}
            value={value}
            placeholder="Search friends…"
            maxLength={searchMax + 1}
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              expanded && active >= 0 && active < suggestions.length ? optionId(active) : undefined
            }
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            aria-describedby={checkId}
            onChange={(event) => {
              setValue(event.target.value);
              setOpen(true);
              setActive(-1);
              setPickOne(false);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
          />
          <ul id={listId} role="listbox" aria-label="People" className={styles.suggestions} hidden={!expanded}>
            {suggestions.map((match, index) => (
              <li
                key={match.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                className={styles.suggestion}
                style={{ "--i": index } as React.CSSProperties}
                // Not blurring the field: the list would close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(match)}
              >
                <Avatar username={match.username} url={match.avatarUrl} className={styles.avatar} />
                <PersonName person={match} className={styles.personName} />
                {match.relation !== "none" && <span className={styles.relation}>{relationNames[match.relation]}</span>}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="primary" type="submit" disabled={busy}>
          Send request
        </Button>
      </div>
      <p
        id={checkId}
        aria-live="polite"
        className={
          check?.found === true ? styles.checkFound : check?.found === false ? styles.checkMissing : styles.check
        }
      >
        {check?.found && <CheckIcon />}
        {check?.text}
      </p>
    </form>
  );
}
