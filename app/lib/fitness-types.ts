// The Fitness app's data, as the API sends it and the browser shows it, and the
// pure logic both use: reading numbers as typed, writing weights, distances,
// times and paces, a workout's summary, what was done last time, starting a
// workout from a routine, personal records, and the series the charts draw.
// No server or browser APIs here, so it is unit tested (test/).

import { dateLabel, datePlus } from "./calendar";

/** One exercise of a routine: what to do, as a plan ("Bench press", 3 sets of 8). */
export type RoutineExercise = { name: string; sets: number; reps: number };

/** A plan for a kind of day at the gym ("Push day"): its exercises, in order. */
export type Routine = {
  id: string;
  name: string;
  exercises: RoutineExercise[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RoutineFields = Pick<Routine, "name" | "exercises" | "notes">;

/** A set of a workout: it counts (history, records) once it is done. */
export type WorkoutSet = { reps: number | null; weightKg: number | null; done: boolean };

/** An exercise of a workout, with its sets in order. Its id is the client's, for the screen. */
export type WorkoutExercise = { id: string; name: string; sets: WorkoutSet[] };

/** A day's session at the gym, from a routine (routineId) or empty. `date` is a Lisbon calendar date. */
export type Workout = {
  id: string;
  date: string;
  name: string;
  routineId: string | null;
  exercises: WorkoutExercise[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutFields = Pick<Workout, "date" | "name" | "routineId" | "exercises" | "notes">;
export type WorkoutChange = Partial<Pick<Workout, "date" | "name" | "exercises" | "notes">>;

/** A run: its day, distance in metres and time in seconds. */
export type Run = {
  id: string;
  date: string;
  distanceM: number;
  durationS: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type RunFields = Pick<Run, "date" | "distanceM" | "durationS" | "notes">;

/** A supplement taken every day ("Creatine", "5 g"). */
export type Supplement = { id: string; name: string; dose: string; createdAt: string };

/** A day of the log: steps (null: not logged), water, body weight (null: not logged), the supplements taken (ids). */
export type Day = { date: string; steps: number | null; waterMl: number; weightKg: number | null; taken: string[] };

export type DayFields = Partial<Omit<Day, "date">>;

/** The daily goals water and steps are shown against. */
export type Goals = { waterMl: number; steps: number };

/** Everything the app shows, in one answer (GET /api/fitness). */
export type FitnessData = {
  /** Oldest first, as they were made. */
  routines: Routine[];
  /** Newest first: the latest day, then the latest made. */
  workouts: Workout[];
  /** Newest first, as workouts. */
  runs: Run[];
  /** Oldest first. */
  supplements: Supplement[];
  /** Oldest first; only the days something was logged. */
  days: Day[];
  goals: Goals;
};

// The limits the API checks (lib/schemas.ts) and the forms say.
export const fitnessLimits = {
  name: 80,
  notes: 2000,
  /** Exercises in a routine or a workout. */
  exercises: 30,
  /** A routine's sets of an exercise. */
  targetSets: 20,
  /** A routine's reps a set. */
  targetReps: 100,
  /** A workout's sets of an exercise. */
  sets: 30,
  reps: 1000,
  weightKg: 1000,
  supplementName: 60,
  dose: 40,
  supplements: 30,
  steps: 200_000,
  waterMl: 20_000,
  bodyWeightMin: 20,
  bodyWeightMax: 400,
  distanceMinM: 10,
  distanceMaxM: 500_000,
  durationMaxS: 359_999,
  waterGoalMin: 250,
  waterGoalMax: 10_000,
  stepsGoalMin: 500,
  stepsGoalMax: 100_000,
} as const;

export const defaultGoals: Goals = { waterMl: 2000, steps: 10_000 };

/** Today's water buttons: a glass and a bottle, in ml. */
export const waterAmounts = [250, 500] as const;

/** A routine's sets and reps to start with. */
export const defaultTarget = { sets: 3, reps: 10 } as const;

// --- Words and numbers ---------------------------------------------------------

/** "3 sets", "1 set". */
export const countOf = (count: number, one: string, many = `${one}s`) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** "10,000", "62.5". */
export const formatNumber = (value: number) => numberFormat.format(value);

/** "78.4 kg", "60 kg", "62.5 kg". */
export const formatKg = (kg: number) => `${numberFormat.format(kg)} kg`;

/** "5.2 km", "10 km", "21.1 km": to the nearest 10 m. */
export const formatKm = (metres: number) => `${numberFormat.format(Math.round(metres / 10) / 100)} km`;

/** "1,250 ml". */
export const formatMl = (ml: number) => `${numberFormat.format(ml)} ml`;

/** Text as typed, tidied: one space between words, none around. */
export const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

/** A name for matching exercises: in any case and without accents ("Supino" is "supino", "Développé" "developpe"). */
export const foldName = (name: string) =>
  tidy(name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** A number as typed, with a point or a comma ("78,4"); null for anything else, or nothing. */
export function parseDecimal(text: string): number | null {
  const typed = text.trim().replace(",", ".");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(typed)) return null;
  return Number(typed);
}

/** A whole number as typed, with thousands apart or not ("10,000", "10 000", "10.000"); null otherwise. */
export function parseCount(text: string): number | null {
  const typed = text.trim();
  if (/^\d+$/.test(typed)) return Number(typed);
  if (/^\d{1,3}([ .,'  ]\d{3})+$/.test(typed)) return Number(typed.replace(/\D/g, ""));
  return null;
}

/** Rounded to the nearest step: 78.43 to 0.1 is 78.4. */
export const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** "28:30", "1:05:30": a run's time. */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** A run's time, from its hours, minutes and seconds as typed; null when one isn't a number in range, or all are 0. */
export function durationOf(hours: string, minutes: string, seconds: string): number | null {
  const [h, m, s] = [hours, minutes, seconds].map((part) => (part.trim() ? parseCount(part) : 0));
  if (h === null || m === null || s === null || h > 99 || m > 59 || s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 && total <= fitnessLimits.durationMaxS ? total : null;
}

/** A run's time as the form shows it: hours, minutes and seconds ("" for no hours). */
export function durationParts(seconds: number): { hours: string; minutes: string; seconds: string } {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  return { hours: h ? String(h) : "", minutes: String(Math.floor((s % 3600) / 60)), seconds: String(s % 60) };
}

/** Seconds a kilometre. */
export const paceOf = (run: Pick<Run, "distanceM" | "durationS">) => (run.durationS / run.distanceM) * 1000;

/** "5:29 /km". */
export const formatPace = (secondsPerKm: number) => `${formatDuration(secondsPerKm)} /km`;

/** "5.2 km · 28:30 · 5:29 /km". */
export const runLine = (run: Pick<Run, "distanceM" | "durationS">) =>
  `${formatKm(run.distanceM)} · ${formatDuration(run.durationS)} · ${formatPace(paceOf(run))}`;

// --- Days ------------------------------------------------------------------------

/** Whether text is a calendar date that exists, YYYY-MM-DD (not 2026-02-31): a panel's day, from the URL. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** "Today", "Yesterday", "Mon 16 Nov", or with its year when it isn't this year's ("Mon 16 Nov 2025"). */
export function dayName(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === datePlus(today, -1)) return "Yesterday";
  return shortDate(date, today);
}

/** "Mon 16 Nov", with the year when it isn't the year of `today` ("Wed 31 Dec 2025"). */
export function shortDate(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  // en-GB puts a comma after the weekday once there is a year: written the same either way.
  return dateLabel(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).replace(",", "");
}

/** "Monday 16 November 2026". */
export const longDate = (date: string) =>
  dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", "");

export const emptyDay = (date: string): Day => ({ date, steps: null, waterMl: 0, weightKg: null, taken: [] });

/** Whether nothing is logged on a day (the server keeps no row for it). */
export const isEmptyDay = (day: Day) =>
  day.steps === null && day.waterMl === 0 && day.weightKg === null && day.taken.length === 0;

/** A day of the log, empty when nothing was logged on it. */
export const dayOf = (days: readonly Day[], date: string) => days.find((day) => day.date === date) ?? emptyDay(date);

/** A day with some of its fields changed. */
export const withDay = (day: Day, fields: DayFields): Day => ({ ...day, ...fields });

/** Each of the `count` days up to `today` (oldest first), with what `pick` reads from it (null: nothing). */
export function lastDays(
  days: readonly Day[],
  today: string,
  count: number,
  pick: (day: Day) => number | null,
): { date: string; value: number | null }[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: count }, (_, i) => {
    const date = datePlus(today, i - count + 1);
    const day = byDate.get(date);
    return { date, value: day ? pick(day) : null };
  });
}

/** The mean of the numbers, or null without any. */
export function average(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

/** The body weights logged, oldest first, from `since` (a date) on. */
export function weightSeries(days: readonly Day[], since = "0000-00-00"): { date: string; value: number }[] {
  return days
    .filter((day) => day.weightKg !== null && day.date >= since)
    .map((day) => ({ date: day.date, value: day.weightKg! }));
}

/** The body weight logged last before a day, to show the change since. */
export function previousWeight(days: readonly Day[], date: string): { date: string; weightKg: number } | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.date < date && day.weightKg !== null) return { date: day.date, weightKg: day.weightKg };
  }
  return null;
}

// --- Workouts ------------------------------------------------------------------------

/** Whether a set counts: done, with at least one rep. */
export const counts = (set: WorkoutSet) => set.done && (set.reps ?? 0) > 0;

/** How much was moved in a set: its reps times its weight (none without a weight). */
export const setVolume = (set: WorkoutSet) => (counts(set) ? (set.reps ?? 0) * (set.weightKg ?? 0) : 0);

export type WorkoutSummary = { exercises: number; sets: number; done: number; volumeKg: number };

export function workoutSummary(workout: Pick<Workout, "exercises">): WorkoutSummary {
  const sets = workout.exercises.flatMap((exercise) => exercise.sets);
  return {
    exercises: workout.exercises.length,
    sets: sets.length,
    done: sets.filter(counts).length,
    volumeKg: Math.round(sets.reduce((sum, set) => sum + setVolume(set), 0)),
  };
}

/** "4 exercises · 9 of 12 sets · 3,240 kg": a workout in a line. */
export function workoutLine(workout: Pick<Workout, "exercises">): string {
  const { exercises, sets, done, volumeKg } = workoutSummary(workout);
  if (!exercises) return "No exercises yet";
  const parts = [
    countOf(exercises, "exercise"),
    done === sets ? countOf(sets, "set") : `${done} of ${countOf(sets, "set")}`,
  ];
  if (volumeKg > 0) parts.push(formatKg(volumeKg));
  return parts.join(" · ");
}

/** "Bench press 3×8 · Squat 5×5": a routine's exercises in a line. */
export const routineLine = (routine: Pick<Routine, "exercises">) =>
  routine.exercises.map((exercise) => `${exercise.name} ${exercise.sets}×${exercise.reps}`).join(" · ");

/** Whether workout `a` was before `b`: an earlier day, or the same day made earlier. */
const before = (a: Pick<Workout, "date" | "createdAt">, b: Pick<Workout, "date" | "createdAt">) =>
  a.date < b.date || (a.date === b.date && a.createdAt < b.createdAt);

/**
 * The sets that counted of an exercise the last time it was done before a
 * workout (in any workout, from any routine), or null if it never was.
 */
export function lastTime(
  workouts: readonly Workout[],
  name: string,
  workout: Pick<Workout, "id" | "date" | "createdAt">,
): { date: string; sets: WorkoutSet[] } | null {
  const folded = foldName(name);
  let latest: { at: Workout; sets: WorkoutSet[] } | null = null;
  for (const other of workouts) {
    if (other.id === workout.id || !before(other, workout)) continue;
    if (latest && !before(latest.at, other)) continue;
    const sets = other.exercises.filter((e) => foldName(e.name) === folded).flatMap((e) => e.sets.filter(counts));
    if (sets.length) latest = { at: other, sets };
  }
  return latest && { date: latest.at.date, sets: latest.sets };
}

/** "60 kg × 8, 8, 7 · 62.5 kg × 6", or "12, 10, 8 reps" without weights: sets in a line. */
export function setsLine(sets: readonly WorkoutSet[]): string {
  const groups: { weightKg: number | null; reps: number[] }[] = [];
  for (const set of sets) {
    const last = groups.at(-1);
    if (last && last.weightKg === (set.weightKg || null)) last.reps.push(set.reps ?? 0);
    else groups.push({ weightKg: set.weightKg || null, reps: [set.reps ?? 0] });
  }
  return groups
    .map(({ weightKg, reps }) =>
      weightKg
        ? `${formatKg(weightKg)} × ${reps.join(", ")}`
        : `${reps.join(", ")} ${reps.length === 1 && reps[0] === 1 ? "rep" : "reps"}`,
    )
    .join(" · ");
}

/** An empty set for an exercise added to a workout, or one more like the last (its reps and weight). */
export const nextSet = (sets: readonly WorkoutSet[]): WorkoutSet => {
  const last = sets.at(-1);
  return { reps: last?.reps ?? null, weightKg: last?.weightKg ?? null, done: false };
};

/**
 * A new workout from a routine: its name, and its exercises with their sets,
 * not done yet, at its reps and the weights of the last time each was done
 * (set by set; the last time's last weight for sets it didn't have).
 */
export function workoutFromRoutine(
  routine: Pick<Routine, "id" | "name" | "exercises">,
  workouts: readonly Workout[],
  { id, date, createdAt, newId }: { id: string; date: string; createdAt: string; newId: () => string },
): Workout {
  const workout = { id, date, createdAt };
  return {
    id,
    date,
    name: routine.name,
    routineId: routine.id,
    notes: "",
    createdAt,
    updatedAt: createdAt,
    exercises: routine.exercises.map((exercise) => {
      const last = lastTime(workouts, exercise.name, workout)?.sets ?? [];
      return {
        id: newId(),
        name: exercise.name,
        sets: Array.from({ length: exercise.sets }, (_, i) => ({
          reps: exercise.reps,
          weightKg: (last[i] ?? last.at(-1))?.weightKg ?? null,
          done: false,
        })),
      };
    }),
  };
}

/** The exercises' names the user has written, each once (as last written), A to Z: what the forms suggest. */
export function knownExercises(routines: readonly Routine[], workouts: readonly Workout[]): string[] {
  const names = new Map<string, string>();
  // Oldest first, so the latest spelling of a name wins.
  for (const routine of [...routines].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)))
    for (const exercise of routine.exercises) names.set(foldName(exercise.name), exercise.name);
  for (const workout of [...workouts].sort((a, b) => (before(a, b) ? -1 : 1)))
    for (const exercise of workout.exercises) names.set(foldName(exercise.name), exercise.name);
  return [...names.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

// --- Records and progress -----------------------------------------------------------

/**
 * The estimated weight for one rep (Epley's formula: weight × (1 + reps / 30)),
 * from a set of 1 to 12 reps with a weight, to 0.1 kg; null otherwise (past 12
 * reps it says little).
 */
export function oneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || weightKg <= 0 || !reps || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

type SetAt = { weightKg: number | null; reps: number; date: string; workoutId: string };

export type LiftRecord = {
  /** As it was written last. */
  name: string;
  /** The heaviest set (more reps first at the same weight; the first time, at the same reps). */
  heaviest: SetAt | null;
  /** The best estimated one-rep max, and the set it is from. */
  oneRepMax: (SetAt & { kg: number }) | null;
  /** The most reps in a set (the heavier first at the same reps). */
  mostReps: SetAt | null;
  /** How many workouts it was done in. */
  sessions: number;
  /** The last day it was done. */
  lastDate: string;
};

/**
 * Each exercise's personal records, from the sets that counted (done, with
 * reps) of every workout, the exercises matched by name in any case and
 * without accents. The ones done most recently first.
 */
export function liftRecords(workouts: readonly Workout[]): LiftRecord[] {
  const records = new Map<string, LiftRecord>();
  const chronological = [...workouts].sort((a, b) => (before(a, b) ? -1 : 1));
  for (const workout of chronological) {
    const seen = new Set<string>();
    for (const exercise of workout.exercises) {
      const sets = exercise.sets.filter(counts);
      if (!sets.length) continue;
      const key = foldName(exercise.name);
      const record = records.get(key) ?? {
        name: exercise.name,
        heaviest: null,
        oneRepMax: null,
        mostReps: null,
        sessions: 0,
        lastDate: workout.date,
      };
      record.name = exercise.name;
      record.lastDate = workout.date;
      if (!seen.has(key)) record.sessions += 1;
      seen.add(key);
      for (const set of sets) {
        const at: SetAt = {
          weightKg: set.weightKg || null,
          reps: set.reps!,
          date: workout.date,
          workoutId: workout.id,
        };
        const weight = at.weightKg ?? 0;
        // Strictly better only: the first time a record was set is the one kept.
        if (
          weight > 0 &&
          (!record.heaviest ||
            weight > record.heaviest.weightKg! ||
            (weight === record.heaviest.weightKg && at.reps > record.heaviest.reps))
        )
          record.heaviest = at;
        const estimate = oneRepMax(at.weightKg, at.reps);
        if (estimate !== null && (!record.oneRepMax || estimate > record.oneRepMax.kg))
          record.oneRepMax = { ...at, kg: estimate };
        if (
          !record.mostReps ||
          at.reps > record.mostReps.reps ||
          (at.reps === record.mostReps.reps && weight > (record.mostReps.weightKg ?? 0))
        )
          record.mostReps = at;
      }
      records.set(key, record);
    }
  }
  return [...records.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

/**
 * The sets of a workout that are personal records, as `${exerciseId}:${index}`:
 * for each exercise, its heaviest set that counted (the first, at the same
 * weight), when it is heavier than any set of that exercise in the workouts
 * before it. The first time an exercise is done has nothing to beat.
 */
export function recordSets(workout: Workout, workouts: readonly Workout[]): Set<string> {
  const best = new Map<string, number>();
  for (const other of workouts) {
    if (other.id === workout.id || !before(other, workout)) continue;
    for (const exercise of other.exercises)
      for (const set of exercise.sets)
        if (counts(set) && set.weightKg) {
          const key = foldName(exercise.name);
          best.set(key, Math.max(best.get(key) ?? 0, set.weightKg));
        }
  }
  const records = new Set<string>();
  for (const exercise of workout.exercises) {
    const previous = best.get(foldName(exercise.name));
    if (!previous) continue;
    let top = -1;
    exercise.sets.forEach((set, i) => {
      if (counts(set) && set.weightKg && (top < 0 || set.weightKg > exercise.sets[top].weightKg!)) top = i;
    });
    if (top >= 0 && exercise.sets[top].weightKg! > previous) records.add(`${exercise.id}:${top}`);
    // The same exercise twice in a workout: its second entry is measured against the first too.
    if (top >= 0) best.set(foldName(exercise.name), Math.max(previous, exercise.sets[top].weightKg!));
  }
  return records;
}

/**
 * An exercise's best set each day it was done (sets that counted, with a
 * weight), oldest first: the heaviest weight, and the best estimated one-rep max.
 */
export function exerciseProgress(
  workouts: readonly Workout[],
  name: string,
): { date: string; weightKg: number; oneRepMax: number | null }[] {
  const folded = foldName(name);
  const byDate = new Map<string, { date: string; weightKg: number; oneRepMax: number | null }>();
  for (const workout of workouts)
    for (const exercise of workout.exercises) {
      if (foldName(exercise.name) !== folded) continue;
      for (const set of exercise.sets) {
        if (!counts(set) || !set.weightKg) continue;
        const day = byDate.get(workout.date) ?? { date: workout.date, weightKg: 0, oneRepMax: null };
        day.weightKg = Math.max(day.weightKg, set.weightKg);
        const estimate = oneRepMax(set.weightKg, set.reps);
        if (estimate !== null) day.oneRepMax = Math.max(day.oneRepMax ?? 0, estimate);
        byDate.set(workout.date, day);
      }
    }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type RunRecords = {
  /** The longest run (the first, at the same distance). */
  longest: Run | null;
  /** The fastest pace of a run of 1 km or more (the first, at the same pace). */
  fastest: Run | null;
};

export function runRecords(runs: readonly Run[]): RunRecords {
  let longest: Run | null = null;
  let fastest: Run | null = null;
  const chronological = [...runs].sort((a, b) => (before(a, b) ? -1 : 1));
  for (const run of chronological) {
    if (!longest || run.distanceM > longest.distanceM) longest = run;
    if (run.distanceM >= 1000 && (!fastest || paceOf(run) < paceOf(fastest))) fastest = run;
  }
  return { longest, fastest };
}

/** The last 7 days to `today`: workouts with a set that counted, the distance run, and the mean steps and water of the days they were logged. */
export function weekStats(data: Pick<FitnessData, "workouts" | "runs" | "days">, today: string) {
  const since = datePlus(today, -6);
  const inWeek = (date: string) => date >= since && date <= today;
  const week = lastDays(data.days, today, 7, (day) => day.steps);
  const water = lastDays(data.days, today, 7, (day) => day.waterMl || null);
  return {
    workouts: data.workouts.filter((w) => inWeek(w.date) && w.exercises.some((e) => e.sets.some(counts))).length,
    distanceM: data.runs.filter((run) => inWeek(run.date)).reduce((sum, run) => sum + run.distanceM, 0),
    steps: average(week.map((day) => day.value)),
    waterMl: average(water.map((day) => day.value)),
  };
}

// --- Charts --------------------------------------------------------------------------

/**
 * An axis's range and its ticks, on round numbers (steps of 1, 2, 2.5 or 5 times
 * a power of ten) covering `min` to `max`, about `count` of them.
 */
export function niceScale(min: number, max: number, count = 4): { min: number; max: number; ticks: number[] } {
  if (max < min) [min, max] = [max, min];
  if (max === min) [min, max] = min === 0 ? [0, 1] : [min - Math.abs(min) * 0.05, max + Math.abs(max) * 0.05];
  const rough = (max - min) / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough * 0.999)!;
  const low = Math.floor(min / step + 1e-9) * step;
  const high = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(Math.round(value * 1e6) / 1e6);
  return { min: low, max: ticks.at(-1)!, ticks };
}

/** An axis's ticks: in full on an axis under 10,000, compact on one that reaches it (0, 5K, 10K), one style per axis. */
export function tickLabels(ticks: readonly number[]): string[] {
  const compact = ticks.some((tick) => Math.abs(tick) >= 10_000);
  return ticks.map((tick) => (compact && tick ? `${formatNumber(tick / 1000)}K` : formatNumber(tick)));
}

// --- History and order ---------------------------------------------------------------

export type HistoryItem = { kind: "workout"; item: Workout } | { kind: "run"; item: Run };

/** Workouts and runs together, newest first: the latest day, then the latest made. */
export function historyOf(workouts: readonly Workout[], runs: readonly Run[]): HistoryItem[] {
  return [
    ...workouts.map((item) => ({ kind: "workout" as const, item })),
    ...runs.map((item) => ({ kind: "run" as const, item })),
  ].sort((a, b) => b.item.date.localeCompare(a.item.date) || b.item.createdAt.localeCompare(a.item.createdAt));
}

const newestFirst = <T extends { date: string; createdAt: string; id: string }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
const oldestMade = <T extends { createdAt: string; id: string }>(a: T, b: T) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** The data in the order the API sends it (FitnessData), after changes made on this device. */
export function sortFitness(data: FitnessData): FitnessData {
  return {
    routines: [...data.routines].sort(oldestMade),
    workouts: [...data.workouts].sort(newestFirst),
    runs: [...data.runs].sort(newestFirst),
    supplements: [...data.supplements].sort(oldestMade),
    days: [...data.days].sort((a, b) => a.date.localeCompare(b.date)),
    goals: data.goals,
  };
}
