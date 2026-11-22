// The JSON bodies the apps' APIs take, as zod schemas: the API routes check every
// request against them (lib/http.ts, apiRoute), and the browser's code sends the
// types they describe. One definition for both, so they can't drift apart. Each
// message is what the API answers when a field is wrong.

import { z } from "./zod";
import { fitnessLimits } from "./fitness-types";
import { defaultServings, normalizeSourceUrl, normalizeTags, recipeLimits } from "./recipe-types";
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

/**
 * Moving a list or a task before another one, or to the end (null); a task to
 * the end of another list of the space with `listId`.
 */
export const moveInput = z.object({
  beforeId: z
    .string({ error: "Invalid position." })
    .regex(uuidPattern, { error: "Invalid position." })
    .transform((id) => id.toLowerCase())
    .nullable()
    .default(null),
  listId: z
    .string({ error: "List not found." })
    .regex(uuidPattern, { error: "List not found." })
    .transform((id) => id.toLowerCase())
    .optional(),
});

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

/** A change to a task: any of its fields. */
export const taskPatch = z.object({ ...taskFields, expectedDueDate: taskFields.dueDate }).partial();

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

/** Discover showed the recommendations of TV shows or movies the user was sent. */
export const recommendationsSeenInput = z.object({ type: mediaTypeSchema });

// --- Recipes -----------------------------------------------------------------

/** Lines of a recipe (ingredients, steps): each trimmed, empty ones left out. */
const recipeLines = (maxLines: number, maxLength: number, what: string, whats: string) =>
  z
    .array(z.string({ error: `Send the ${whats} as lines of text.` }), { error: `Send the ${whats} as lines of text.` })
    .transform((lines) => lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean))
    .pipe(
      z
        .array(
          z.string().max(maxLength, { error: `Keep each ${what} to ${maxLength.toLocaleString("en")} characters.` }),
        )
        .max(maxLines, { error: `A recipe can have up to ${maxLines} ${whats}.` }),
    );

const recipeFields = {
  title: title(recipeLimits.title, "a title"),
  servings: z
    .number({ error: `Enter how many it serves, from 1 to ${recipeLimits.servings}.` })
    .int({ error: `Enter how many it serves, from 1 to ${recipeLimits.servings}.` })
    .min(1, { error: `Enter how many it serves, from 1 to ${recipeLimits.servings}.` })
    .max(recipeLimits.servings, { error: `Enter how many it serves, from 1 to ${recipeLimits.servings}.` }),
  ingredients: recipeLines(recipeLimits.ingredients, recipeLimits.ingredient, "ingredient", "ingredients"),
  steps: recipeLines(recipeLimits.steps, recipeLimits.step, "step", "steps"),
  notes: z
    .string({ error: "Notes must be at most 10,000 characters." })
    .max(recipeLimits.notes, { error: "Notes must be at most 10,000 characters." }),
  // Read generously: without https:// is fine (lib/recipe-types.ts, normalizeSourceUrl).
  sourceUrl: z
    .string({ error: "Enter a link to where the recipe is from, or none." })
    .max(recipeLimits.sourceUrl, { error: "That link is too long." })
    .nullable()
    .transform((url) => (url === null ? null : normalizeSourceUrl(url)))
    .refine((url) => url !== undefined, { error: "Enter a web link, like https://example.com/recipe, or none." }),
  tags: z
    .array(z.string({ error: "Send the tags as text." }), { error: "Send the tags as text." })
    .transform(normalizeTags)
    .pipe(
      z
        .array(z.string().max(recipeLimits.tag, { error: `Keep each tag to ${recipeLimits.tag} characters.` }))
        .max(recipeLimits.tags, { error: `A recipe can have up to ${recipeLimits.tags} tags.` }),
    ),
  isFavourite: z.boolean({ error: "Mark it as a favourite or not." }),
};

/** A new recipe: only its title is needed. */
export const recipeCreate = z.object({
  id: uuid.optional(),
  title: recipeFields.title,
  servings: recipeFields.servings.default(defaultServings),
  ingredients: recipeFields.ingredients.default([]),
  steps: recipeFields.steps.default([]),
  notes: recipeFields.notes.default(""),
  sourceUrl: recipeFields.sourceUrl.default(null),
  tags: recipeFields.tags.default([]),
  isFavourite: recipeFields.isFavourite.default(false),
});

/** A change to a recipe: any of its fields. */
export const recipePatch = z.object(recipeFields).partial();

const shoppingText = title(recipeLimits.shoppingText, "an item");

/** Lines added to the end of the shopping list, typed or from a recipe's ingredients. */
export const shoppingAdd = z.object({
  items: z
    .array(
      z.object({
        id: uuid.optional(),
        text: shoppingText,
        recipeId: uuid.nullable().default(null),
      }),
      { error: "Send the items to add." },
    )
    .min(1, { error: "Add at least one item." })
    .max(recipeLimits.ingredients, { error: `Add up to ${recipeLimits.ingredients} items at a time.` }),
});

/** A change to a line of the shopping list: its text, or ticked off (or not). */
export const shoppingPatch = z.object({
  text: shoppingText.optional(),
  isChecked: z.boolean({ error: "Tick it off or not." }).optional(),
});

/** Lines taken off the shopping list (Clear ticked, or one deleted). */
export const shoppingRemove = z.object({
  ids: z
    .array(uuid, { error: "Send the items to remove." })
    .min(1, { error: "Choose an item to remove." })
    .max(recipeLimits.shoppingItems, { error: "Too many items at once." }),
});

// --- Fitness -------------------------------------------------------------------

/** A whole number from `min` to `max`, with one message for anything else. */
const wholeNumber = (min: number, max: number, message: string) =>
  z.number({ error: message }).int({ error: message }).min(min, { error: message }).max(max, { error: message });

const fitnessDate = z
  .string({ error: "Enter a date as dd/mm/yyyy." })
  .refine(isDate, { error: "Enter a date as dd/mm/yyyy." });
const fitnessNotes = z
  .string({ error: "Notes must be at most 2,000 characters." })
  .max(fitnessLimits.notes, { error: "Notes must be at most 2,000 characters." });
const exerciseName = title(fitnessLimits.name, "an exercise's name");

const routineExercise = z.object({
  name: exerciseName,
  sets: wholeNumber(1, fitnessLimits.targetSets, `Enter from 1 to ${fitnessLimits.targetSets} sets.`),
  reps: wholeNumber(1, fitnessLimits.targetReps, `Enter from 1 to ${fitnessLimits.targetReps} reps.`),
});

const routineFields = {
  name: title(fitnessLimits.name, "a name"),
  exercises: z
    .array(routineExercise, { error: "Send the routine's exercises." })
    .min(1, { error: "Add at least one exercise." })
    .max(fitnessLimits.exercises, { error: `A routine can have up to ${fitnessLimits.exercises} exercises.` }),
  notes: fitnessNotes,
};

/** A new routine: its name and exercises. */
export const routineCreate = z.object({
  id: uuid.optional(),
  name: routineFields.name,
  exercises: routineFields.exercises,
  notes: routineFields.notes.default(""),
});

/** A change to a routine: any of its fields. */
export const routinePatch = z.object(routineFields).partial();

const workoutSet = z.object({
  reps: wholeNumber(0, fitnessLimits.reps, `Enter from 0 to ${fitnessLimits.reps} reps.`).nullable(),
  weightKg: z
    .number({ error: `Enter a weight from 0 to ${fitnessLimits.weightKg} kg.` })
    .min(0, { error: `Enter a weight from 0 to ${fitnessLimits.weightKg} kg.` })
    .max(fitnessLimits.weightKg, { error: `Enter a weight from 0 to ${fitnessLimits.weightKg} kg.` })
    .transform((kg) => Math.round(kg * 100) / 100)
    .nullable(),
  done: z.boolean({ error: "Mark the set done or not." }),
});

const workoutExercise = z.object({
  id: uuid,
  name: exerciseName,
  sets: z
    .array(workoutSet, { error: "Send the exercise's sets." })
    .max(fitnessLimits.sets, { error: `An exercise can have up to ${fitnessLimits.sets} sets.` }),
});

const workoutFields = {
  date: fitnessDate,
  name: title(fitnessLimits.name, "a name"),
  exercises: z
    .array(workoutExercise, { error: "Send the workout's exercises." })
    .max(fitnessLimits.exercises, { error: `A workout can have up to ${fitnessLimits.exercises} exercises.` }),
  notes: fitnessNotes,
};

/** A new workout: its day and name; from a routine (routineId), with exercises, or empty. */
export const workoutCreate = z.object({
  id: uuid.optional(),
  date: workoutFields.date,
  name: workoutFields.name,
  routineId: uuid.nullable().default(null),
  exercises: workoutFields.exercises.default([]),
  notes: workoutFields.notes.default(""),
});

/** A change to a workout: its day, name, exercises (all of them, with their sets) or notes. */
export const workoutPatch = z.object(workoutFields).partial();

const runFields = {
  date: fitnessDate,
  distanceM: wholeNumber(
    fitnessLimits.distanceMinM,
    fitnessLimits.distanceMaxM,
    `Enter a distance from 0.01 to ${fitnessLimits.distanceMaxM / 1000} km.`,
  ),
  durationS: wholeNumber(1, fitnessLimits.durationMaxS, "Enter a time from 1 second to 99:59:59."),
  notes: fitnessNotes,
};

/** A new run: its day, distance (metres) and time (seconds). */
export const runCreate = z.object({
  id: uuid.optional(),
  date: runFields.date,
  distanceM: runFields.distanceM,
  durationS: runFields.durationS,
  notes: runFields.notes.default(""),
});

export const runPatch = z.object(runFields).partial();

/** A new supplement: its name, and its dose if any ("5 g"). */
export const supplementCreate = z.object({
  id: uuid.optional(),
  name: title(fitnessLimits.supplementName, "a name"),
  dose: z
    .string({ error: `Keep the dose to ${fitnessLimits.dose} characters.` })
    .transform((dose) => dose.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(fitnessLimits.dose, { error: `Keep the dose to ${fitnessLimits.dose} characters.` }))
    .default(""),
});

/** A change to a day of the log: any of its fields; null clears the steps or the weight. */
export const dayPatch = z.object({
  steps: wholeNumber(0, fitnessLimits.steps, `Enter from 0 to ${fitnessLimits.steps.toLocaleString("en")} steps.`)
    .nullable()
    .optional(),
  waterMl: wholeNumber(
    0,
    fitnessLimits.waterMl,
    `Enter from 0 to ${fitnessLimits.waterMl.toLocaleString("en")} ml of water.`,
  ).optional(),
  weightKg: z
    .number({ error: `Enter a weight from ${fitnessLimits.bodyWeightMin} to ${fitnessLimits.bodyWeightMax} kg.` })
    .min(fitnessLimits.bodyWeightMin, {
      error: `Enter a weight from ${fitnessLimits.bodyWeightMin} to ${fitnessLimits.bodyWeightMax} kg.`,
    })
    .max(fitnessLimits.bodyWeightMax, {
      error: `Enter a weight from ${fitnessLimits.bodyWeightMin} to ${fitnessLimits.bodyWeightMax} kg.`,
    })
    .transform((kg) => Math.round(kg * 10) / 10)
    .nullable()
    .optional(),
  taken: z
    .array(uuid, { error: "Send the supplements taken." })
    .max(fitnessLimits.supplements, { error: "Too many supplements." })
    .transform((ids) => [...new Set(ids)])
    .optional(),
});

/** A change to the daily goals. */
export const goalsPatch = z.object({
  waterMl: wholeNumber(
    fitnessLimits.waterGoalMin,
    fitnessLimits.waterGoalMax,
    `Enter a water goal from ${fitnessLimits.waterGoalMin} to ${fitnessLimits.waterGoalMax.toLocaleString("en")} ml.`,
  ).optional(),
  steps: wholeNumber(
    fitnessLimits.stepsGoalMin,
    fitnessLimits.stepsGoalMax,
    `Enter a steps goal from ${fitnessLimits.stepsGoalMin} to ${fitnessLimits.stepsGoalMax.toLocaleString("en")}.`,
  ).optional(),
});
