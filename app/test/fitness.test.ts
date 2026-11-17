import { describe, expect, test } from "vitest";
import {
  average,
  dayName,
  durationOf,
  durationParts,
  exerciseProgress,
  foldName,
  formatDuration,
  formatKg,
  formatKm,
  formatPace,
  historyOf,
  isDay,
  knownExercises,
  lastDays,
  lastTime,
  liftRecords,
  niceScale,
  oneRepMax,
  paceOf,
  parseCount,
  parseDecimal,
  previousWeight,
  recordSets,
  runRecords,
  setsLine,
  tickLabels,
  weekStats,
  workoutFromRoutine,
  workoutLine,
  type Day,
  type Run,
  type Workout,
  type WorkoutSet,
} from "@/lib/fitness-types";
import { dayPatch, goalsPatch, routineCreate, runCreate, supplementCreate, workoutPatch } from "@/lib/schemas";

const done = (weightKg: number | null, reps: number): WorkoutSet => ({ weightKg, reps, done: true });
const planned = (weightKg: number | null, reps: number | null): WorkoutSet => ({ weightKg, reps, done: false });

let made = 0;
/** A workout on a day, made one after another (createdAt), with exercises as [name, sets]. */
function workout(date: string, exercises: [string, WorkoutSet[]][], id = `w${++made}`): Workout {
  const createdAt = `${date}T${String(8 + (made % 10)).padStart(2, "0")}:00:00.000Z`;
  return {
    id,
    date,
    name: "Push day",
    routineId: null,
    exercises: exercises.map(([name, sets], i) => ({ id: `${id}-e${i}`, name, sets })),
    notes: "",
    createdAt,
    updatedAt: createdAt,
  };
}

const run = (date: string, distanceM: number, durationS: number, id = `r${++made}`): Run => ({
  id,
  date,
  distanceM,
  durationS,
  notes: "",
  createdAt: `${date}T07:00:00.000Z`,
  updatedAt: `${date}T07:00:00.000Z`,
});

const day = (date: string, fields: Partial<Day>): Day => ({
  date,
  steps: null,
  waterMl: 0,
  weightKg: null,
  taken: [],
  ...fields,
});

describe("numbers as typed and written", () => {
  test("decimals with a point or a comma; whole numbers with their thousands apart or not", () => {
    expect(parseDecimal("78.4")).toBe(78.4);
    expect(parseDecimal("78,4")).toBe(78.4);
    expect(parseDecimal(" 60 ")).toBe(60);
    expect(parseDecimal(".5")).toBe(0.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("6O")).toBeNull();
    expect(parseDecimal("-5")).toBeNull();
    expect(parseCount("10000")).toBe(10000);
    expect(parseCount("10,000")).toBe(10000);
    expect(parseCount("10 000")).toBe(10000);
    expect(parseCount("10.000")).toBe(10000);
    expect(parseCount("10.5")).toBeNull();
    expect(parseCount("1,00")).toBeNull();
  });

  test("weights, distances, times and paces", () => {
    expect(formatKg(62.5)).toBe("62.5 kg");
    expect(formatKg(3240)).toBe("3,240 kg");
    expect(formatKm(5210)).toBe("5.21 km");
    expect(formatKm(10000)).toBe("10 km");
    expect(formatDuration(1710)).toBe("28:30");
    expect(formatDuration(3930)).toBe("1:05:30");
    expect(formatDuration(59)).toBe("0:59");
    // 5.2 km in 28:30 is 5:29 a km.
    expect(formatPace(paceOf({ distanceM: 5200, durationS: 1710 }))).toBe("5:29 /km");
  });

  test("a run's time from its hours, minutes and seconds, and back", () => {
    expect(durationOf("", "28", "30")).toBe(1710);
    expect(durationOf("1", "5", "")).toBe(3900);
    expect(durationOf("", "60", "0")).toBeNull();
    expect(durationOf("", "", "")).toBeNull();
    expect(durationOf("", "2a", "")).toBeNull();
    expect(durationParts(3930)).toEqual({ hours: "1", minutes: "5", seconds: "30" });
    expect(durationParts(1710)).toEqual({ hours: "", minutes: "28", seconds: "30" });
  });

  test("exercises match in any case and without accents", () => {
    expect(foldName("  Bench   Press ")).toBe("bench press");
    expect(foldName("Développé couché")).toBe("developpe couche");
  });

  test("days: real dates only, and their names", () => {
    expect(isDay("2026-11-17")).toBe(true);
    expect(isDay("2026-02-31")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("17/11/2026")).toBe(false);
    expect(dayName("2026-11-17", "2026-11-17")).toBe("Today");
    expect(dayName("2026-11-16", "2026-11-17")).toBe("Yesterday");
    expect(dayName("2026-11-12", "2026-11-17")).toBe("Thu 12 Nov");
    expect(dayName("2025-12-31", "2026-11-17")).toBe("Wed 31 Dec 2025");
  });
});

describe("a workout", () => {
  test("its summary counts the sets done (with reps) and what was moved", () => {
    const w = workout("2026-11-17", [
      ["Bench press", [done(60, 8), done(60, 8), planned(60, 8)]],
      ["Pull-up", [done(null, 10), done(0, 0)]],
    ]);
    expect(workoutLine(w)).toBe("2 exercises · 3 of 5 sets · 960 kg");
    expect(workoutLine(workout("2026-11-17", [["Plank", [done(null, 1)]]]))).toBe("1 exercise · 1 set");
    expect(workoutLine(workout("2026-11-17", []))).toBe("No exercises yet");
  });

  test("the last time an exercise was done: the latest earlier workout with a set done of it", () => {
    const old = workout("2026-11-03", [["Bench press", [done(55, 8)]]]);
    const last = workout("2026-11-10", [["bench PRESS", [done(60, 8), done(60, 7), planned(60, 8)]]]);
    const skipped = workout("2026-11-12", [["Bench press", [planned(65, 8)]]]);
    const now = workout("2026-11-17", [["Bench press", []]]);
    const later = workout("2026-11-20", [["Bench press", [done(70, 5)]]]);
    const workouts = [later, now, skipped, last, old];
    expect(lastTime(workouts, "Bench press", now)).toEqual({ date: "2026-11-10", sets: [done(60, 8), done(60, 7)] });
    expect(lastTime(workouts, "Squat", now)).toBeNull();
    expect(lastTime(workouts, "Bench press", old)).toBeNull();
  });

  test("sets in a line, grouped by weight", () => {
    expect(setsLine([done(60, 8), done(60, 8), done(62.5, 6)])).toBe("60 kg × 8, 8 · 62.5 kg × 6");
    expect(setsLine([done(null, 12), done(null, 10)])).toBe("12, 10 reps");
  });

  test("started from a routine: its sets at its reps and the last time's weights, none done", () => {
    const last = workout("2026-11-10", [["Squat", [done(100, 5), done(105, 5)]]]);
    let n = 0;
    const started = workoutFromRoutine(
      {
        id: "routine",
        name: "Legs",
        exercises: [
          { name: "Squat", sets: 3, reps: 5 },
          { name: "Lunge", sets: 2, reps: 10 },
        ],
      },
      [last],
      { id: "new", date: "2026-11-17", createdAt: "2026-11-17T18:00:00.000Z", newId: () => `id${++n}` },
    );
    expect(started).toMatchObject({ id: "new", date: "2026-11-17", name: "Legs", routineId: "routine" });
    expect(started.exercises).toEqual([
      { id: "id1", name: "Squat", sets: [planned(100, 5), planned(105, 5), planned(105, 5)] },
      { id: "id2", name: "Lunge", sets: [planned(null, 10), planned(null, 10)] },
    ]);
  });

  test("the exercises written before, each once as last written, A to Z", () => {
    const routine = {
      id: "r",
      name: "Push",
      exercises: [{ name: "bench press", sets: 3, reps: 8 }],
      notes: "",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    const workouts = [
      workout("2026-11-10", [
        ["Bench Press", []],
        ["Dips", []],
      ]),
    ];
    expect(knownExercises([routine], workouts)).toEqual(["Bench Press", "Dips"]);
  });
});

describe("records and progress", () => {
  test("the estimated one-rep max, from 1 to 12 reps with a weight", () => {
    expect(oneRepMax(100, 1)).toBe(100);
    expect(oneRepMax(100, 5)).toBe(116.7);
    expect(oneRepMax(100, 13)).toBeNull();
    expect(oneRepMax(null, 5)).toBeNull();
    expect(oneRepMax(0, 5)).toBeNull();
  });

  test("each exercise's heaviest set, best estimate and most reps, from the sets done", () => {
    const workouts = [
      workout("2026-11-17", [["Bench press", [done(80, 3), planned(120, 1)]]]),
      workout("2026-11-10", [
        ["bench press", [done(80, 5), done(70, 10)]],
        ["Pull-up", [done(null, 12)]],
      ]),
      workout("2026-11-03", [["Bench press", [done(80, 5)]]]),
    ];
    const [bench, pullUp] = liftRecords(workouts);
    expect(bench.name).toBe("Bench press");
    expect(bench.sessions).toBe(3);
    expect(bench.lastDate).toBe("2026-11-17");
    // 80 × 5 first on the 3rd: the same set again on the 10th isn't a new record.
    expect(bench.heaviest).toMatchObject({ weightKg: 80, reps: 5, date: "2026-11-03" });
    // 70 × 10 is about 93.3, more than 80 × 5 (93.3 too, but not more).
    expect(bench.oneRepMax).toMatchObject({ kg: 93.3, date: "2026-11-03" });
    expect(bench.mostReps).toMatchObject({ reps: 10, weightKg: 70 });
    expect(pullUp).toMatchObject({ name: "Pull-up", heaviest: null, oneRepMax: null });
    expect(pullUp.mostReps).toMatchObject({ reps: 12, weightKg: null });
  });

  test("a workout's personal records: its heaviest set of an exercise, heavier than any before", () => {
    const before = workout("2026-11-10", [["Squat", [done(100, 5)]]]);
    const today = workout("2026-11-17", [
      ["Squat", [done(100, 5), done(105, 3), done(105, 2), planned(110, 1)]],
      ["Deadlift", [done(140, 5)]],
    ]);
    const after = workout("2026-11-20", [["Squat", [done(120, 1)]]]);
    // The first 105 is the record; Deadlift's first time has nothing to beat; later workouts don't count.
    expect(recordSets(today, [after, today, before])).toEqual(new Set([`${today.id}-e0:1`]));
    expect(recordSets(before, [after, today, before]).size).toBe(0);
  });

  test("an exercise's heaviest set each day, oldest first", () => {
    const workouts = [
      workout("2026-11-17", [["Squat", [done(110, 3)]]]),
      workout("2026-11-17", [["squat", [done(100, 8)]]]),
      workout("2026-11-10", [["Squat", [done(100, 5), planned(130, 1)]]]),
    ];
    expect(exerciseProgress(workouts, "SQUAT")).toEqual([
      { date: "2026-11-10", weightKg: 100, oneRepMax: 116.7 },
      { date: "2026-11-17", weightKg: 110, oneRepMax: 126.7 },
    ]);
  });

  test("runs: the longest, and the fastest pace of 1 km or more, the first at the same", () => {
    const sprint = run("2026-11-01", 400, 60);
    const first = run("2026-11-03", 5000, 1500);
    const same = run("2026-11-05", 5000, 1500);
    const long = run("2026-11-10", 10000, 3300);
    const { longest, fastest } = runRecords([long, same, first, sprint]);
    expect(longest).toBe(long);
    expect(fastest).toBe(first);
    expect(runRecords([])).toEqual({ longest: null, fastest: null });
  });

  test("the last 7 days: workouts with a set done, distance, and the mean of the days logged", () => {
    const data = {
      workouts: [
        workout("2026-11-17", [["Squat", [done(100, 5)]]]),
        workout("2026-11-15", [["Squat", [planned(100, 5)]]]),
        workout("2026-11-10", [["Squat", [done(100, 5)]]]),
      ],
      runs: [run("2026-11-16", 5000, 1500), run("2026-11-11", 8000, 2400), run("2026-11-10", 3000, 900)],
      days: [
        day("2026-11-10", { steps: 20000 }),
        day("2026-11-14", { steps: 8000, waterMl: 1500 }),
        day("2026-11-17", { steps: 10000, waterMl: 2500 }),
      ],
    };
    expect(weekStats(data, "2026-11-17")).toEqual({ workouts: 1, distanceM: 13000, steps: 9000, waterMl: 2000 });
  });

  test("the days to today, oldest first, and the weight before a day", () => {
    const days = [day("2026-11-10", { weightKg: 79 }), day("2026-11-15", { weightKg: 78.4, steps: 500 })];
    expect(lastDays(days, "2026-11-16", 3, (d) => d.steps)).toEqual([
      { date: "2026-11-14", value: null },
      { date: "2026-11-15", value: 500 },
      { date: "2026-11-16", value: null },
    ]);
    expect(previousWeight(days, "2026-11-15")).toEqual({ date: "2026-11-10", weightKg: 79 });
    expect(previousWeight(days, "2026-11-10")).toBeNull();
    expect(average([null, 2, 4])).toBe(3);
    expect(average([null])).toBeNull();
  });

  test("workouts and runs together, newest first", () => {
    const w = workout("2026-11-15", []);
    const r = run("2026-11-16", 5000, 1500);
    expect(historyOf([w], [r]).map((item) => item.kind)).toEqual(["run", "workout"]);
  });

  test("an axis on round numbers", () => {
    expect(niceScale(0, 10000, 4)).toEqual({ min: 0, max: 10000, ticks: [0, 5000, 10000] });
    expect(niceScale(0, 2600, 4)).toEqual({ min: 0, max: 3000, ticks: [0, 1000, 2000, 3000] });
    expect(niceScale(76.3, 79.1, 4)).toEqual({ min: 76, max: 80, ticks: [76, 77, 78, 79, 80] });
    expect(niceScale(0, 0).ticks).toEqual([0, 0.5, 1]);
    expect(tickLabels([0, 2500, 5000])).toEqual(["0", "2,500", "5,000"]);
    expect(tickLabels([0, 5000, 10000, 15000])).toEqual(["0", "5K", "10K", "15K"]);
  });
});

describe("the Fitness API's schemas", () => {
  test("a routine needs a name and an exercise; its sets and reps are whole numbers in range", () => {
    expect(
      routineCreate.safeParse({ name: "  Push  ", exercises: [{ name: "Bench", sets: 3, reps: 8 }] }).data,
    ).toEqual({ name: "Push", exercises: [{ name: "Bench", sets: 3, reps: 8 }], notes: "" });
    expect(routineCreate.safeParse({ name: "Push", exercises: [] }).error?.issues[0].message).toBe(
      "Add at least one exercise.",
    );
    expect(routineCreate.safeParse({ name: "Push", exercises: [{ name: "Bench", sets: 0, reps: 8 }] }).success).toBe(
      false,
    );
    expect(routineCreate.safeParse({ name: "Push", exercises: [{ name: "Bench", sets: 3, reps: 8.5 }] }).success).toBe(
      false,
    );
  });

  test("a workout's sets: reps and weights in range, or none; ids are the client's", () => {
    const exercise = { id: "00000000-0000-4000-8000-00000000000A", name: "Squat", sets: [done(100.004, 5)] };
    expect(workoutPatch.safeParse({ exercises: [exercise] }).data?.exercises?.[0]).toEqual({
      id: "00000000-0000-4000-8000-00000000000a",
      name: "Squat",
      sets: [{ weightKg: 100, reps: 5, done: true }],
    });
    expect(workoutPatch.safeParse({ exercises: [{ ...exercise, sets: [done(1001, 5)] }] }).success).toBe(false);
    expect(workoutPatch.safeParse({ exercises: [{ ...exercise, id: "e1" }] }).success).toBe(false);
    expect(workoutPatch.safeParse({ date: "2026-02-30" }).success).toBe(false);
  });

  test("a run, a supplement, a day and the goals", () => {
    expect(runCreate.safeParse({ date: "2026-11-17", distanceM: 5200, durationS: 1710 }).success).toBe(true);
    expect(runCreate.safeParse({ date: "2026-11-17", distanceM: 5, durationS: 1710 }).success).toBe(false);
    expect(supplementCreate.safeParse({ name: "Creatine", dose: "  5   g " }).data).toEqual({
      name: "Creatine",
      dose: "5 g",
    });
    expect(supplementCreate.safeParse({ name: "Vitamin D" }).data).toEqual({ name: "Vitamin D", dose: "" });
    expect(dayPatch.safeParse({ weightKg: 78.44, steps: null }).data).toEqual({ weightKg: 78.4, steps: null });
    expect(dayPatch.safeParse({ weightKg: 15 }).success).toBe(false);
    expect(dayPatch.safeParse({ waterMl: 250.5 }).success).toBe(false);
    expect(goalsPatch.safeParse({ waterMl: 100 }).success).toBe(false);
    expect(goalsPatch.safeParse({ steps: 8000 }).data).toEqual({ steps: 8000 });
  });
});
