"use client";
import { useEffect, useId, useState } from "react";
import { CheckIcon } from "@/components/common/icons";
import { usernameHint, USERNAME_MAX } from "@/lib/account-rules";
import type { FriendsState, PeopleSearch, PersonMatch } from "@/lib/show-types";
import { showsRequest, useDebounced } from "./shows-data";
import styles from "./Shows.module.css";

// Suggestions are asked for once typing pauses this long, from 2 characters
// (lib/friends.ts, searchPeople).
const debounceMs = 200;
const searchMin = 2;

const relationNames: Record<PersonMatch["relation"], string> = {
  none: "", friend: "Friends", incoming: "Sent you a request", outgoing: "Request sent",
};

// "@Bob " is bob: usernames are lowercase, and the @ is optional.
const normalize = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

/** What a friend request to `value` did, from the friends and requests the server answered with. */
export function requestSentText(next: FriendsState, value: string): string {
  const name = normalize(value);
  // They had already sent the user a request: now accepted.
  return next.friends.some((friend) => friend.username === name)
    ? `${name} had already sent you a request: you're now friends.` : `Friend request sent to ${name}.`;
}

// What the field says about what's typed, under it: whether an account has
// that username, as soon as the search for it is back.
function checkText(text: string, search: PeopleSearch | null, searched: boolean): { text: string; found?: boolean } | null {
  if (!text) return null;
  if (!/^[a-z0-9_]*$/.test(text) || text.length > USERNAME_MAX) return { text: `Usernames have ${usernameHint}`, found: false };
  if (text.length < searchMin) return null;
  if (!searched || !search) return { text: "Checking…" };
  if (search.self) return { text: "That's your own username.", found: false };
  const exact = search.matches.find((match) => match.username === text);
  if (search.exact) {
    const relation = exact && exact.relation !== "none" ? ` · ${relationNames[exact.relation]}` : "";
    return { text: `${text} has an account${relation}`, found: true };
  }
  // The start of usernames that have accounts: the suggestions say it. And 2
  // characters can't be a whole username.
  if (search.matches.length || text.length < 3) return null;
  return { text: `No account has the username ${text}.`, found: false };
}

/**
 * Add a friend: a username field that suggests the accounts whose username
 * starts with what's typed, in a list under it (a combobox: arrows and Enter,
 * or a tap, pick one), and says whether an account has exactly that username.
 * `onAdd` sends the request, and says whether it went (the field empties).
 */
export function AddFriend({ username, busy, onAdd }: { username: string; busy: boolean; onAdd: (username: string) => Promise<boolean> }) {
  const inputId = useId();
  const hintId = useId();
  const checkId = useId();
  const listId = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; data: PeopleSearch } | null>(null);
  const [searchError, setSearchError] = useState("");

  const text = normalize(value);
  const searchable = text.length >= searchMin && text.length <= USERNAME_MAX && /^[a-z0-9_]+$/.test(text);
  const query = useDebounced(searchable ? text : "", debounceMs);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    showsRequest<PeopleSearch>(`/friends/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((data) => { setResult({ query, data }); setSearchError(""); })
      .catch((error: Error) => { if (!controller.signal.aborted) setSearchError(error.message); });
    return () => controller.abort();
  }, [query]);

  // The last answer's usernames that still fit what's typed, while the next one loads.
  const suggestions = searchable && result && text.startsWith(result.query)
    ? result.data.matches.filter((match) => match.username.startsWith(text)) : [];
  const current = result?.query === text ? result.data : null;
  const check = searchError && searchable ? { text: searchError, found: false } : checkText(text, current, !!current);
  const expanded = open && suggestions.length > 0;
  const optionId = (index: number) => `${listId}-${index}`;

  function choose(match: PersonMatch) {
    setValue(match.username);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      // Round and round the list; the first press starts at its top or bottom.
      const last = suggestions.length - 1;
      setActive((index) => event.key === "ArrowDown" ? (index >= 0 && index < last ? index + 1 : 0)
        : (index > 0 && index <= last ? index - 1 : last));
    } else if (event.key === "Enter" && expanded && active >= 0 && active < suggestions.length) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  return <form className={styles.addFriend} onSubmit={async (event) => {
    event.preventDefault();
    setOpen(false);
    setActive(-1);
    if (await onAdd(value)) setValue("");
  }}>
    <label htmlFor={inputId} className={styles.label}>Add a friend</label>
    <div className={styles.addFriendRow}>
      <div className={styles.combo}>
        <input id={inputId} value={value} placeholder="Their username" maxLength={21}
          role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 && active < suggestions.length ? optionId(active) : undefined}
          autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send"
          aria-describedby={`${checkId} ${hintId}`}
          onChange={(event) => { setValue(event.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onKeyDown={onKeyDown} />
        <ul id={listId} role="listbox" aria-label="Usernames" className={styles.suggestions} hidden={!expanded}>
          {suggestions.map((match, index) => <li key={match.id} id={optionId(index)} role="option" aria-selected={index === active}
            className={styles.suggestion}
            // Not blurring the field: the list would close before the click lands.
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(match)}>
            <span className={styles.avatar} aria-hidden="true">{match.username[0]}</span>
            <span className={styles.personName}>{match.username}</span>
            {match.relation !== "none" && <span className={styles.relation}>{relationNames[match.relation]}</span>}
          </li>)}
        </ul>
      </div>
      <button type="submit" className={styles.primary} disabled={busy}>Send request</button>
    </div>
    <p id={checkId} aria-live="polite" className={check?.found === true ? styles.checkFound : check?.found === false ? styles.checkMissing : styles.check}>
      {check?.found && <CheckIcon />}{check?.text}
    </p>
    <p id={hintId} className={styles.hint}>Friends add you by your username, <strong>{username}</strong>.</p>
  </form>;
}
