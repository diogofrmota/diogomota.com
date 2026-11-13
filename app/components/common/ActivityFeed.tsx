"use client";

import { Avatar } from "@/components/common/Avatar";
import type { ActivityItem } from "@/lib/activity-types";
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
function sentence(item: ActivityItem, title: React.ReactNode): React.ReactNode {
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
          recommended {title} to {memberName(item.data.to)}
        </>
      );
  }
}

/**
 * An activity feed (lib/activity.ts): what the space's members, or the user's
 * friends, did lately, newest first. In Shows, a title opens its panel.
 */
export function ActivityFeed({
  items,
  empty,
  onOpenTitle,
}: {
  items: ActivityItem[];
  empty: string;
  onOpenTitle?: (title: TitleSummary) => void;
}) {
  if (!items.length) return <p className={styles.empty}>{empty}</p>;
  return (
    <ol className={styles.feed}>
      {items.map((item) => {
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
          <li key={item.id}>
            <Avatar username={item.person.username} url={item.person.avatarUrl} className={styles.avatar} />
            <p>
              <strong>{memberName(item.person)}</strong> {sentence(item, title)}
              <time dateTime={item.createdAt} className={styles.when}>
                {timeAgo(item.createdAt)}
              </time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
