// The JSON bodies the apps' APIs take, as zod schemas: the API routes check every
// request against them (lib/http.ts, apiRoute), and the browser's code sends the
// types they describe. One definition for both, so they can't drift apart. Each
// message is what the API answers when a field is wrong.

import { z } from "zod";
import { repeats } from "./task-types";

const uuidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** An id the client chose, or none (the server picks one). */
export const uuid = z
  .string({ error: "Invalid id." })
  .regex(uuidPattern, { error: "Invalid id." })
  .transform((id) => id.toLowerCase());

export const isUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);

/** A calendar date, YYYY-MM-DD, that exists (not 2026-02-31). */
export const isDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(19|2\d)\d{2}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** A UTC instant as the API writes them: 2026-11-12T18:30:00.000Z. */
const isInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);

const title = (max: number, what: string) =>
  z
    .string({ error: `Enter ${what} between 1 and ${max} characters.` })
    .trim()
    .min(1, { error: `Enter ${what} between 1 and ${max} characters.` })
    .max(max, { error: `Enter ${what} between 1 and ${max} characters.` });

/** Moving a list or a task before another one, or to the end (null). */
export const moveInput = z.object({
  beforeId: z
    .string({ error: "Invalid position." })
    .regex(uuidPattern, { error: "Invalid position." })
    .transform((id) => id.toLowerCase())
    .nullable()
    .default(null),
});
export type MoveInput = z.input<typeof moveInput>;

// --- Shared: spaces ----------------------------------------------------------

/**
 * An invite code as it was typed or pasted, read generously (Postel's law):
 * in any case, with spaces or dashes in it (as it is shown, in two groups of
 * four: "ABCD 2345"), or as the whole invite link. Whether it is a code at all
 * is the schema's to say.
 */
export function inviteCodeOf(text: string): string {
  const fromLink = /\/join\/([^/?#\s]+)/i.exec(text)?.[1] ?? text;
  return fromLink.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export const joinInput = z.object({
  code: z
    .string({ error: "Invalid invite code. Check the code and try again." })
    .transform(inviteCodeOf)
    .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/, { error: "Invalid invite code. Check the code and try again." })),
});
export type JoinInput = z.input<typeof joinInput>;

// --- Shared: calendar --------------------------------------------------------

const instant = z.string().refine(isInstant);

/**
 * An event, created or replaced: who it's for is the whole group, or one or
 * more members (assigneeIds), checked against the space by lib/events.ts.
 */
export const eventInput = z
  .object({
    title: title(200, "a title"),
    startsAt: instant,
    endsAt: instant,
    allDay: z.boolean({ error: "allDay must be true or false." }).default(false),
    isGroup: z.boolean({ error: "Assign the event to current members or the whole group." }),
    assigneeIds: z
      .array(uuid, { error: "Assign the event to current members or the whole group." })
      .max(10)
      .default([]),
  })
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    error: "Provide valid UTC times, with the end after the start.",
  })
  .refine((event) => (event.isGroup ? event.assigneeIds.length === 0 : event.assigneeIds.length > 0), {
    error: "Assign the event to current members or the whole group.",
  });
export type EventInput = z.input<typeof eventInput>;

/** The events between two instants (a calendar's visible period, give or take). */
export const eventRange = z
  .object({ from: instant, to: instant })
  .refine((range) => Date.parse(range.to) > Date.parse(range.from), { error: "The range must end after it starts." })
  .refine((range) => Date.parse(range.to) - Date.parse(range.from) <= 400 * 86_400_000, {
    error: "Ask for at most 400 days at a time.",
  });

/** The agenda's events: the first `limit` that haven't ended by `from` (the start of its first day). */
export const upcomingEvents = z.object({
  from: instant,
  limit: z.coerce
    .number({ error: "Ask for a number of events." })
    .int({ error: "Ask for a whole number of events." })
    .min(1, { error: "Ask for at least one event." })
    .max(500, { error: "Ask for at most 500 events at a time." }),
});

// --- Shared: tasks -----------------------------------------------------------

export const listInput = z.object({ id: uuid.optional(), name: title(80, "a list name") });
export type ListInput = z.input<typeof listInput>;
export const listRename = z.object({ name: title(80, "a list name") });

const taskFields = {
  title: title(200, "a task title"),
  notes: z
    .string({ error: "Notes must be at most 10,000 characters." })
    .max(10_000, { error: "Notes must be at most 10,000 characters." }),
  dueDate: z
    .string({ error: "Enter a valid due date, or none." })
    .refine(isDate, { error: "Enter a valid due date, or none." })
    .nullable(),
  assigneeId: z.string({ error: "Assign the task to a current member, or to nobody." }).nullable(),
  assigneeIds: z
    .array(uuid)
    .max(10)
    .transform((ids) => [...new Set(ids)])
    .optional(),
  isComplete: z.boolean({ error: "isComplete must be true or false." }),
  repeat: z.enum(repeats, { error: "Repeat it daily, weekly, monthly or yearly, or not at all." }).nullable(),
};

/** A new task: only its title is needed. */
export const taskCreate = z.object({
  id: uuid.optional(),
  title: taskFields.title,
  notes: taskFields.notes.default(""),
  dueDate: taskFields.dueDate.default(null),
  assigneeId: taskFields.assigneeId.default(null),
  assigneeIds: taskFields.assigneeIds,
  isComplete: taskFields.isComplete.default(false),
  repeat: taskFields.repeat.default(null),
});
export type TaskCreate = z.input<typeof taskCreate>;

/** A change to a task: any of its fields. */
export const taskPatch = z.object(taskFields).partial();
export type TaskPatch = z.input<typeof taskPatch>;

// --- Shows -------------------------------------------------------------------

export const mediaTypeSchema = z.enum(["tv", "movie"], { error: "Choose TV shows or movies." });

export const libraryAdd = z.object({
  type: mediaTypeSchema,
  tmdbId: z
    .number({ error: "Title not found." })
    .int({ error: "Title not found." })
    .positive({ error: "Title not found." })
    .lt(2 ** 31, { error: "Title not found." }),
  status: z.enum(["planned", "watching", "completed"], { error: "Add it as Watching, Planned or Completed." }),
});
export type LibraryAdd = z.input<typeof libraryAdd>;

/**
 * A change to a library entry. Unknown fields (a rating, from before ratings
 * went) are ignored; progress is checked against the show's seasons by lib/shows.ts.
 */
export const libraryPatch = z.object({
  status: z.enum(["watching", "planned", "completed"], { error: "Choose Watching, Planned or Completed." }).optional(),
  isFavourite: z.boolean({ error: "Mark it as a favourite or not." }).optional(),
  currentSeason: z.unknown().optional(),
  currentEpisode: z.unknown().optional(),
});
export type LibraryPatch = z.input<typeof libraryPatch>;

// Checked in sendFriendRequest (lib/friends.ts), which says "Enter a username." for none.
export const friendRequest = z.object({ username: z.unknown().optional() });

/** Recommending a title to a friend. */
export const recommendInput = z.object({
  friendId: z.string({ error: "Choose a friend." }).regex(uuidPattern, { error: "Choose a friend." }),
  type: mediaTypeSchema,
  tmdbId: z
    .number({ error: "Title not found." })
    .int({ error: "Title not found." })
    .positive({ error: "Title not found." })
    .lt(2 ** 31, { error: "Title not found." }),
});
export type RecommendInput = z.input<typeof recommendInput>;
