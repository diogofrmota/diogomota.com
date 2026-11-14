"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { ActivityFeed } from "@/components/common/ActivityFeed";
import { Avatar } from "@/components/common/Avatar";
import { CalendarIcon } from "@/components/common/icons";
import { CopiedIcon, reducedMotion, useBriefly } from "@/components/common/motion";
import { PersonName } from "@/components/common/PersonName";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button, Confirm, Notice } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { UndoToast, useUndo } from "@/components/common/Undo";
import type { ActivityItem } from "@/lib/activity-types";
import type { Space } from "@/lib/space-types";
import { InviteLink } from "./InviteLink";
import { sharedKeys, sharedRequest, spaceQuery } from "./shared-data";
import styles from "./Spaces.module.css";

type Feed = { url: string; webcal: string };

/** The link with its secret (the last part) as dots, for under the blur: the page never shows it until asked. */
const hiddenLink = (url: string) => url.replace(/[^/]+$/, (secret) => "•".repeat(secret.length));

/**
 * Subscribing to the calendar from another app (Google, Apple, Outlook): its
 * own secret link, which those apps check every few hours, with the events'
 * reminders of that app. A new link stops the old one.
 */
function CalendarFeedCard() {
  const client = useQueryClient();
  const feed = useQuery({
    queryKey: sharedKeys.feed,
    queryFn: ({ signal }) => sharedRequest<Feed>("/calendar-feed", { signal }),
    staleTime: Infinity,
  });
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  // Just shown: the blurred dots, over the link, being wiped away (Spaces.module.css, .veil).
  const [unveiling, setUnveiling] = useState(false);
  const [copied, showCopied] = useBriefly();
  const field = useRef<HTMLInputElement>(null);

  async function copy() {
    if (!feed.data) return;
    try {
      await navigator.clipboard.writeText(feed.data.url);
      setNotice({ text: "Link copied. In Google Calendar: Other calendars, +, From URL." });
      showCopied();
    } catch {
      setNotice({ text: "Couldn't copy the link. Select it and copy it instead.", error: true });
    }
  }
  async function renew() {
    setBusy(true);
    try {
      client.setQueryData(sharedKeys.feed, await sharedRequest<Feed>("/calendar-feed", { method: "POST" }));
      setNotice({ text: "New link made. Calendars with the old one stop getting updates." });
    } catch (error) {
      setNotice({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
      setConfirmNew(false);
    }
  }

  return (
    <section className={ui.card} aria-labelledby="feed-heading">
      <h2 id="feed-heading" className={ui.cardHeading}>
        Calendar in your phone
      </h2>
      <p className={ui.muted}>
        Subscribe to this calendar from Google, Apple or Outlook Calendar: its events show up there next to your own,
        with that app&rsquo;s reminders. It updates every few hours.
      </p>
      {feed.isPending && <Spinner label="Loading the link…" />}
      {feed.isError && <Alert onRetry={() => void feed.refetch()}>{feed.error.message}</Alert>}
      {feed.data && (
        <>
          {/* Secret, so hidden at first: blurred, with Show over it, which takes the blur away (and itself). */}
          <div className={ui.field}>
            <label htmlFor="feed-url">Calendar link</label>
            <div className={styles.secret}>
              <input
                ref={field}
                id="feed-url"
                className={`${ui.input} ${shown ? "" : styles.hidden}`}
                readOnly
                value={shown ? feed.data.url : hiddenLink(feed.data.url)}
                tabIndex={shown ? undefined : -1}
                onFocus={(e) => e.target.select()}
              />
              {unveiling && (
                <span className={styles.veil} aria-hidden="true" onAnimationEnd={() => setUnveiling(false)}>
                  {hiddenLink(feed.data.url)}
                </span>
              )}
              {!shown && (
                <button
                  type="button"
                  className={styles.show}
                  aria-label="Show the link"
                  onClick={() => {
                    flushSync(() => {
                      setShown(true);
                      setUnveiling(!reducedMotion());
                    });
                    field.current?.focus();
                  }}
                >
                  Show
                </button>
              )}
            </div>
          </div>
          <div className={ui.actions}>
            <Button onClick={copy}>
              <CopiedIcon copied={copied} />
              Copy link
            </Button>
            <a className={`${ui.button} ${ui.primary}`} href={feed.data.webcal}>
              <CalendarIcon />
              Add to my calendar
            </a>
          </div>
          {confirmNew ? (
            <Confirm
              confirmLabel="Make a new link"
              cancelLabel="Keep this one"
              busy={busy}
              onConfirm={renew}
              onCancel={() => setConfirmNew(false)}
            >
              Calendars subscribed with this link stop getting updates. Make a new one?
            </Confirm>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmNew(true)}>
              Make a new link
            </Button>
          )}
        </>
      )}
      {notice && <Notice error={notice.error}>{notice.text}</Notice>}
    </section>
  );
}

/** What the members did lately: events added, tasks ticked off, who joined. */
function ActivityCard() {
  const activity = useQuery({
    queryKey: sharedKeys.activity,
    queryFn: ({ signal }) => sharedRequest<ActivityItem[]>("/activity", { signal }),
  });
  return (
    <section className={ui.card} aria-labelledby="activity-heading">
      <h2 id="activity-heading" className={ui.cardHeading}>
        Recent activity
      </h2>
      {activity.isPending && <Spinner label="Loading activity…" />}
      {activity.isError && <Alert onRetry={() => void activity.refetch()}>{activity.error.message}</Alert>}
      {activity.data && <ActivityFeed items={activity.data} empty="Nothing yet: what you both do shows here." />}
    </section>
  );
}

function SpaceCards({
  space,
  userId,
  onChange,
}: {
  space: Space;
  userId: string;
  onChange: (space: Space | null) => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const undo = useUndo();
  const client = useQueryClient();
  const last = space.members.length === 1;

  async function leave() {
    setLeaving(true);
    setLeaveError("");
    try {
      await sharedRequest(`/spaces/${space.id}/leave`, { method: "POST", keepalive: true });
      client.setQueryData(spaceQuery.queryKey, null);
      onChange(null);
    } catch (error) {
      setLeaveError((error as Error).message);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <>
      <section className={ui.card} aria-labelledby="members-heading">
        <h2 id="members-heading" className={ui.cardHeading}>
          Members
        </h2>
        {/* Each with their picture (or initial) in a ring of their color, as in
            the calendar, then their name and @username; only the owner is marked. */}
        <ul className={styles.members}>
          {space.members.map((member) => (
            <li key={member.id}>
              <Avatar
                username={member.username}
                url={member.avatarUrl}
                className={styles.memberAvatar}
                style={{ "--member-color": member.color } as CSSProperties}
              />
              <span className={styles.memberName}>
                <PersonName person={member} />
                {member.id === userId ? " (you)" : ""}
              </span>
              {member.role === "owner" && <span className={styles.role}>Owner</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className={ui.card} aria-labelledby="invite-heading">
        <h2 id="invite-heading" className={ui.cardHeading}>
          Invite someone
        </h2>
        <p className={ui.muted}>Share an invite with someone else. It expires in 24 hours!</p>
        <InviteLink space={space} />
      </section>
      <CalendarFeedCard />
      <ActivityCard />
      {/* Leaving: a button after the cards. It can be undone for a few seconds;
          as the last member it deletes the space, so it asks first instead. */}
      {confirmLeave ? (
        <Confirm
          confirmLabel="Leave and delete"
          busy={leaving}
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        >
          You&rsquo;re the last member: leaving deletes this group, its calendar and its tasks. Leave it?
        </Confirm>
      ) : (
        <Button
          variant="remove"
          busy={leaving || !!undo.pending}
          onClick={() => {
            if (last) setConfirmLeave(true);
            else undo.schedule({ label: "Leaving this group…", commit: () => void leave() });
          }}
        >
          Leave this group
        </Button>
      )}
      {leaveError && <Notice error>{leaveError}</Notice>}
      <UndoToast undo={undo} />
    </>
  );
}

/**
 * Shared's Settings tab: the space's members, invites, the calendar
 * subscription, recent activity and leaving. The space is SharedApp's, and
 * every change goes back to it (onChange): members who came or went show in the
 * other tabs, and leaving takes Shared back to creating or joining a space.
 */
export function SpaceSettings({
  space,
  userId,
  onChange,
}: {
  space: Space;
  userId: string;
  onChange: (space: Space | null) => void;
}) {
  // Loaded again each time the tab is shown (Activity resumes the query), so
  // what other members changed meanwhile shows.
  const current = useQuery(spaceQuery);
  // Only an answer loaded since the tab was shown: one kept from before may be older than the space.
  useEffect(() => {
    if (current.isFetchedAfterMount && !current.isFetching && current.data !== undefined) onChange(current.data);
  }, [current.data, current.isFetchedAfterMount, current.isFetching, onChange]);

  // The top bar's Settings tab names the view; the h1 is for screen readers.
  return (
    <div className={ui.view}>
      <h1 className={ui.srOnly}>Settings</h1>
      <div className={ui.stack}>
        {current.isError && <Alert onRetry={() => void current.refetch()}>{current.error.message}</Alert>}
        <SpaceCards space={space} userId={userId} onChange={onChange} />
      </div>
    </div>
  );
}
