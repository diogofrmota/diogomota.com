"use client";

import { useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import ui from "@/components/common/ui.module.css";
import { groupActivity, type ActivityItem } from "@/lib/activity-types";
import { localParts } from "@/lib/calendar";
import { memberName } from "@/lib/names";
import type { TitleSummary } from "@/lib/show-types";
import styles from "./ActivityFeed.module.css";

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Lisbon" });

/** "just now", "5 minutes ago", "yesterday", "12 Nov". */
export function timeAgo(instant: string, now = Date.now()): string {
  const seconds = Math.round((now - Date.parse(instant)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return relative.format(-Math.floor(seconds / 3600), "hour");
  const days = Math.round(seconds / 86_400);
  return days < 7 ? relative.format(-days, "day") : dayFormat.format(new Date(instant));
}

/** An event's day, for "added Dinner on 14 Nov". */
function onDay(startsAt: string) {
  const { date } = localParts(startsAt);
  return dayFormat.format(new Date(`${date}T12:00:00Z`));
}

/** What happened, as a sentence after the person's name, with the title (a button) where there is one. */
function sentence(item: ActivityItem, title: React.ReactNode, viewer?: string): React.ReactNode {
  switch (item.kind) {
    case "joined":
      return "joined the space";
    case "left":
      return "left the space";
    case "event-added":
      return `added ${item.data.title} on ${onDay(item.data.startsAt)}`;
    case "event-changed":
      return `changed ${item.data.title}`;
    case "event-deleted":
      return `deleted ${item.data.title}`;
    case "list-added":
      return `made the list ${item.data.name}`;
    case "task-added":
      return `added ${item.data.title} to ${item.data.list}`;
    case "task-done":
      return `ticked off ${item.data.title}`;
    case "watching":
      return <>started watching {title}</>;
    case "planned":
      return <>wants to watch {title}</>;
    case "completed":
      return <>finished {title}</>;
    case "favourite":
      return <>made {title} a favourite</>;
    case "recommended":
      return (
        <>
          recommended {title} to {item.data.to.username === viewer ? "you" : memberName(item.data.to)}
        </>
      );
  }
}

const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** A run of one kind by one person, as one line. */
function runSentence(run: ActivityItem[]): string {
  const n = run.length;
  const names = (values: string[]) => list.format([...new Set(values)]);
  const first = run[0];
  switch (first.kind) {
    case "event-added":
      return `added ${n} events`;
    case "event-changed":
      return `changed ${n} events`;
    case "event-deleted":
      return `deleted ${n} events`;
    case "list-added":
      return `made the lists ${names(run.map((item) => (item.kind === "list-added" ? item.data.name : "")))}`;
    case "task-added":
      return `added ${n} tasks to ${names(run.map((item) => (item.kind === "task-added" ? item.data.list : "")))}`;
    case "task-done":
      return `ticked off ${n} tasks`;
    default:
      return "";
  }
}

/**
 * An activity feed (lib/activity.ts): what the space's members, or the user's
 * friends, did lately, newest first, a run of the same thing as one line. In
 * Shows, a title opens its panel. With `limit`, the first that many lines,
 * then Show more for the rest.
 */
export function ActivityFeed({
  items,
  empty,
  onOpenTitle,
  viewer,
  limit,
}: {
  items: ActivityItem[];
  empty: string;
  onOpenTitle?: (title: TitleSummary) => void;
  /** The user's username: something done to them reads "to you". */
  viewer?: string;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  const lines = groupActivity(items);
  const shown = limit && !all ? lines.slice(0, limit) : lines;
  return (
    <>
      <ol className={styles.feed}>
        {shown.map((run, index) => {
          const item = run[0];
          const title =
            item.title &&
            (onOpenTitle ? (
              <button type="button" className={styles.title} onClick={() => onOpenTitle(item.title!)}>
                {item.title.title}
              </button>
            ) : (
              <strong>{item.title.title}</strong>
            ));
          return (
            <li key={item.id} style={{ "--i": index } as React.CSSProperties}>
              <Avatar
                username={item.person.username}
                name={item.person.name}
                url={item.person.avatarUrl}
                className={styles.avatar}
              />
              <p>
                <strong>{memberName(item.person)}</strong>{" "}
                {run.length > 1 ? runSentence(run) : sentence(item, title, viewer)}
                <time dateTime={item.createdAt} className={styles.when}>
                  {timeAgo(item.createdAt)}
                </time>
              </p>
            </li>
          );
        })}
      </ol>
      {shown.length < lines.length && (
        <button type="button" className={`${ui.button} ${styles.more}`} onClick={() => setAll(true)}>
          Show more
        </button>
      )}
    </>
  );
}
