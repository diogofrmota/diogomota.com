import "server-only";
import { randomBytes } from "node:crypto";
import { calendarIcs } from "./calendar";
import { query } from "./db";
import { listEvents } from "./events";
import { transaction } from "./spaces";
import { memberName } from "./names";
import type { Space } from "./space-types";
import { avatarUrlSql } from "./users";

// Calendar subscriptions (017_calendar_feeds_invite_links.sql): one secret link
// per user, which calendar apps (Google, Apple, Outlook) check every few hours
// for what the user's space has planned. Whoever has the link can read that
// calendar, nothing more; a new link stops the old one.

/** The feed's address: https (to paste in Google Calendar) and webcal (to open in Apple's and Outlook). */
export type CalendarFeed = { url: string; webcal: string };

function feedOf(token: string): CalendarFeed {
  const url = new URL(`/api/calendar/${token}`, process.env.AUTH_URL ?? "http://localhost:3000").href;
  return { url, webcal: url.replace(/^https?:/, "webcal:") };
}

const newToken = () => randomBytes(24).toString("base64url");

/** The user's feed, made the first time it is asked for. */
export async function calendarFeed(userId: string): Promise<CalendarFeed> {
  const { rows } = await query<{ token: string }>(
    `INSERT INTO calendar_feeds (user_id, token) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET token = calendar_feeds.token RETURNING token`,
    [userId, newToken()],
  );
  return feedOf(rows[0].token);
}

/** A new link for the user's feed; the old one stops working. */
export async function newCalendarFeed(userId: string): Promise<CalendarFeed> {
  const { rows } = await query<{ token: string }>(
    `INSERT INTO calendar_feeds (user_id, token) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = now() RETURNING token`,
    [userId, newToken()],
  );
  return feedOf(rows[0].token);
}

/** How often calendar apps are asked to check again. */
const refreshHours = 3;

/**
 * The calendar file of a feed's token: the events of its user's space from 3
 * months ago on. Null for a token nobody has; an empty calendar for a user
 * without a space (the link keeps working if they join one).
 */
export async function feedCalendar(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  return transaction(async (db) => {
    const { rows } = await db.query<{ spaceId: string | null }>(
      `SELECT u.space_id AS "spaceId" FROM calendar_feeds f JOIN users u ON u.id = f.user_id WHERE f.token = $1`,
      [token],
    );
    if (!rows[0]) return null;
    const feed = { name: "Shared calendar", refreshHours };
    if (!rows[0].spaceId) return calendarIcs([], new Map(), feed);
    const members = await db.query<Space["members"][number]>(
      `SELECT id, username, name, ${avatarUrlSql()} AS "avatarUrl" FROM users WHERE space_id = $1`,
      [rows[0].spaceId],
    );
    const names = new Map(members.rows.map((member) => [member.id, memberName(member)]));
    const from = new Date(Date.now() - 92 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 5 * 365 * 86_400_000).toISOString();
    const events = await listEvents(db, { id: rows[0].spaceId, ownerId: "", members: members.rows }, { from, to });
    return calendarIcs(events, names, feed);
  });
}
