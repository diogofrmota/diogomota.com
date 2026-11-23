import "server-only";
import { query, transaction } from "./db";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import {
  defaultGoals,
  emptyDay,
  fitnessLimits,
  isEmptyDay,
  type Day,
  type FitnessData,
  type Goals,
  type Routine,
  type Run,
  type Supplement,
  type Workout,
} from "./fitness-types";
import { HttpError } from "./http";
import {
  isDate,
  isUuid,
  type dayPatch,
  type goalsPatch,
  type routineCreate,
  type routinePatch,
  type runCreate,
  type runPatch,
  type supplementCreate,
  type workoutCreate,
  type workoutPatch,
} from "./schemas";

// The Fitness app's data: each user's own routines, workouts, runs,
// supplements, daily log and goals. Nobody else sees them, so every query is
// by the user's id, and another user's routine, workout, run or supplement
// answers 404 as one that doesn't exist. Clients may choose the ids of what
// they create, so they can keep working with it before the response arrives,
// offline too; creating it again with the same id (a change sent twice)
// answers with what is there.

const routineColumns = `id, name, exercises, notes, created_at AS "createdAt", updated_at AS "updatedAt"`;
const workoutColumns = `id, date::text AS date, name, routine_id AS "routineId", exercises, notes,
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const runColumns = `id, date::text AS date, distance_m AS "distanceM", duration_s AS "durationS", notes,
  created_at AS "createdAt", updated_at AS "updatedAt"`;
const supplementColumns = `id, name, dose, created_at AS "createdAt"`;
const dayColumns = `date::text AS date, steps, water_ml AS "waterMl", weight_kg::float8 AS "weightKg",
  supplements_taken AS taken`;

/** Everything the app shows (GET /api/fitness), in the order of FitnessData. */
export async function readFitness(userId: string): Promise<FitnessData> {
  const [routines, workouts, runs, supplements, days, goals] = await Promise.all([
    query<Routine>(`SELECT ${routineColumns} FROM fitness_routines WHERE user_id = $1 ORDER BY created_at, id`, [
      userId,
    ]),
    query<Workout>(
      `SELECT ${workoutColumns} FROM fitness_workouts WHERE user_id = $1 ORDER BY date DESC, created_at DESC, id`,
      [userId],
    ),
    query<Run>(`SELECT ${runColumns} FROM fitness_runs WHERE user_id = $1 ORDER BY date DESC, created_at DESC, id`, [
      userId,
    ]),
    query<Supplement>(
      `SELECT ${supplementColumns} FROM fitness_supplements WHERE user_id = $1 ORDER BY created_at, id`,
      [userId],
    ),
    query<Day>(`SELECT ${dayColumns} FROM fitness_days WHERE user_id = $1 ORDER BY date`, [userId]),
    readGoals(userId),
  ]);
  return {
    routines: routines.rows,
    workouts: workouts.rows,
    runs: runs.rows,
    supplements: supplements.rows,
    days: days.rows,
    goals,
  };
}

/** Sets the columns given (`columns` maps each field to its column), and updated_at; false when no row is the user's. */
async function updateRow(
  table: string,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
  columns: Record<string, string>,
): Promise<boolean> {
  const fields = Object.entries(patch).filter(([key, value]) => value !== undefined && key in columns);
  const sets = fields.map(([key], i) => `${columns[key]} = $${i + 3}`);
  sets.push("updated_at = now()");
  const values = fields.map(([key, value]) => (columns[key] === "exercises" ? JSON.stringify(value) : value));
  const { rowCount } = await query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
    ...values,
  ]);
  return !!rowCount;
}

/** A create sent twice is answered with what is there; someone else's id is refused. */
const alreadyTaken = (what: string) => (error: unknown) => {
  throw error instanceof HttpError ? new HttpError(`Could not save the ${what}. Try again.`, 409) : error;
};

// --- Routines ---------------------------------------------------------------------

const routineNotFound = () => new HttpError("Routine not found.", 404);

async function readRoutine(userId: string, id: string): Promise<Routine> {
  if (!isUuid(id)) throw routineNotFound();
  const { rows } = await query<Routine>(
    `SELECT ${routineColumns} FROM fitness_routines WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (!rows[0]) throw routineNotFound();
  return rows[0];
}

export async function createRoutine(userId: string, input: z.output<typeof routineCreate>): Promise<Routine> {
  const id = input.id ?? randomUUID();
  await query(
    `INSERT INTO fitness_routines (id, user_id, name, exercises, notes) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [id, userId, input.name, JSON.stringify(input.exercises), input.notes],
  );
  return readRoutine(userId, id).catch(alreadyTaken("routine"));
}

export async function updateRoutine(
  userId: string,
  id: string,
  patch: z.output<typeof routinePatch>,
): Promise<Routine> {
  if (!isUuid(id)) throw routineNotFound();
  const columns = { name: "name", exercises: "exercises", notes: "notes" };
  if (!(await updateRow("fitness_routines", userId, id, patch, columns))) throw routineNotFound();
  return readRoutine(userId, id);
}

/** Deletes a routine; the workouts started from it stay, from no routine. */
export async function deleteRoutine(userId: string, id: string): Promise<null> {
  if (!isUuid(id)) throw routineNotFound();
  const { rowCount } = await query("DELETE FROM fitness_routines WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rowCount) throw routineNotFound();
  return null;
}

// --- Workouts ---------------------------------------------------------------------

const workoutNotFound = () => new HttpError("Workout not found.", 404);

async function readWorkout(userId: string, id: string): Promise<Workout> {
  if (!isUuid(id)) throw workoutNotFound();
  const { rows } = await query<Workout>(
    `SELECT ${workoutColumns} FROM fitness_workouts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (!rows[0]) throw workoutNotFound();
  return rows[0];
}

/** Adds a workout; a routine that isn't the user's (or is gone) is left off it. */
export async function createWorkout(userId: string, input: z.output<typeof workoutCreate>): Promise<Workout> {
  const id = input.id ?? randomUUID();
  await query(
    `INSERT INTO fitness_workouts (id, user_id, date, name, routine_id, exercises, notes)
     VALUES ($1, $2, $3, $4, (SELECT r.id FROM fitness_routines r WHERE r.id = $5 AND r.user_id = $2), $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [id, userId, input.date, input.name, input.routineId, JSON.stringify(input.exercises), input.notes],
  );
  return readWorkout(userId, id).catch(alreadyTaken("workout"));
}

export async function updateWorkout(
  userId: string,
  id: string,
  patch: z.output<typeof workoutPatch>,
): Promise<Workout> {
  if (!isUuid(id)) throw workoutNotFound();
  const columns = { date: "date", name: "name", exercises: "exercises", notes: "notes" };
  if (!(await updateRow("fitness_workouts", userId, id, patch, columns))) throw workoutNotFound();
  return readWorkout(userId, id);
}

export async function deleteWorkout(userId: string, id: string): Promise<null> {
  if (!isUuid(id)) throw workoutNotFound();
  const { rowCount } = await query("DELETE FROM fitness_workouts WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rowCount) throw workoutNotFound();
  return null;
}

// --- Runs ---------------------------------------------------------------------------

const runNotFound = () => new HttpError("Run not found.", 404);

async function readRun(userId: string, id: string): Promise<Run> {
  if (!isUuid(id)) throw runNotFound();
  const { rows } = await query<Run>(`SELECT ${runColumns} FROM fitness_runs WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
  if (!rows[0]) throw runNotFound();
  return rows[0];
}

export async function createRun(userId: string, input: z.output<typeof runCreate>): Promise<Run> {
  const id = input.id ?? randomUUID();
  await query(
    `INSERT INTO fitness_runs (id, user_id, date, distance_m, duration_s, notes) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, userId, input.date, input.distanceM, input.durationS, input.notes],
  );
  return readRun(userId, id).catch(alreadyTaken("run"));
}

export async function updateRun(userId: string, id: string, patch: z.output<typeof runPatch>): Promise<Run> {
  if (!isUuid(id)) throw runNotFound();
  const columns = { date: "date", distanceM: "distance_m", durationS: "duration_s", notes: "notes" };
  if (!(await updateRow("fitness_runs", userId, id, patch, columns))) throw runNotFound();
  return readRun(userId, id);
}

export async function deleteRun(userId: string, id: string): Promise<null> {
  if (!isUuid(id)) throw runNotFound();
  const { rowCount } = await query("DELETE FROM fitness_runs WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rowCount) throw runNotFound();
  return null;
}

// --- Supplements -------------------------------------------------------------------

const supplementNotFound = () => new HttpError("Supplement not found.", 404);

/** Adds a supplement, up to fitnessLimits.supplements; one sent twice is answered as it is. */
export async function createSupplement(userId: string, input: z.output<typeof supplementCreate>): Promise<Supplement> {
  const id = input.id ?? randomUUID();
  return transaction(async (db) => {
    // One request at a time per user, so the limit holds.
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const { rows: counted } = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM fitness_supplements WHERE user_id = $1 AND id <> $2",
      [userId, id],
    );
    if (counted[0].count >= fitnessLimits.supplements)
      throw new HttpError(`You can keep up to ${fitnessLimits.supplements} supplements.`, 409);
    await db.query(
      `INSERT INTO fitness_supplements (id, user_id, name, dose) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [id, userId, input.name, input.dose],
    );
    const { rows } = await db.query<Supplement>(
      `SELECT ${supplementColumns} FROM fitness_supplements WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!rows[0]) throw new HttpError("Could not save the supplement. Try again.", 409);
    return rows[0];
  });
}

/** Deletes a supplement; the days it was taken on forget it. */
export async function deleteSupplement(userId: string, id: string): Promise<null> {
  if (!isUuid(id)) throw supplementNotFound();
  const { rowCount } = await query("DELETE FROM fitness_supplements WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!rowCount) throw supplementNotFound();
  return null;
}

// --- Days and goals -------------------------------------------------------------------

async function readDay(db: PoolClient, userId: string, date: string): Promise<Day> {
  const { rows } = await db.query<Day>(`SELECT ${dayColumns} FROM fitness_days WHERE user_id = $1 AND date = $2`, [
    userId,
    date,
  ]);
  return rows[0] ?? emptyDay(date);
}

/**
 * Changes the fields given of a day of the log (a Lisbon date), and answers
 * with the day. A day with nothing logged any more has no row.
 */
export async function updateDay(userId: string, date: string, patch: z.output<typeof dayPatch>): Promise<Day> {
  if (!isDate(date)) throw new HttpError("Enter a date as dd/mm/yyyy.", 404);
  return transaction(async (db) => {
    // One change at a time per user, so two changes to a day don't undo each other.
    await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const day = { ...(await readDay(db, userId, date)) };
    if (patch.steps !== undefined) day.steps = patch.steps;
    if (patch.waterMl !== undefined) day.waterMl = patch.waterMl;
    if (patch.weightKg !== undefined) day.weightKg = patch.weightKg;
    if (patch.taken !== undefined) day.taken = patch.taken;
    if (isEmptyDay(day)) {
      await db.query("DELETE FROM fitness_days WHERE user_id = $1 AND date = $2", [userId, date]);
      return day;
    }
    await db.query(
      `INSERT INTO fitness_days (user_id, date, steps, water_ml, weight_kg, supplements_taken)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, date) DO UPDATE SET steps = EXCLUDED.steps, water_ml = EXCLUDED.water_ml,
         weight_kg = EXCLUDED.weight_kg, supplements_taken = EXCLUDED.supplements_taken`,
      [userId, date, day.steps, day.waterMl, day.weightKg, day.taken],
    );
    return readDay(db, userId, date);
  });
}

async function readGoals(userId: string): Promise<Goals> {
  const { rows } = await query<Goals>(`SELECT water_ml AS "waterMl", steps FROM fitness_goals WHERE user_id = $1`, [
    userId,
  ]);
  return rows[0] ?? defaultGoals;
}

export async function updateGoals(userId: string, patch: z.output<typeof goalsPatch>): Promise<Goals> {
  const { rows } = await query<Goals>(
    // Typed: in coalesce(), parameters alone would be text.
    `INSERT INTO fitness_goals (user_id, water_ml, steps)
     VALUES ($1, coalesce($2::int, $4::int), coalesce($3::int, $5::int))
     ON CONFLICT (user_id) DO UPDATE SET water_ml = coalesce($2::int, fitness_goals.water_ml),
       steps = coalesce($3::int, fitness_goals.steps)
     RETURNING water_ml AS "waterMl", steps`,
    [userId, patch.waterMl ?? null, patch.steps ?? null, defaultGoals.waterMl, defaultGoals.steps],
  );
  return rows[0];
}
