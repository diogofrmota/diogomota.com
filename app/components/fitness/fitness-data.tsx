"use client";
import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useUndo } from "@/components/common/Undo";
import { apiRequest, ApiError } from "@/lib/api-request";
import { localParts } from "@/lib/calendar";
import {
  dayOf,
  isEmptyDay,
  sortFitness,
  withDay,
  workoutFromRoutine,
  type Day,
  type DayFields,
  type FitnessData,
  type Goals,
  type Routine,
  type RoutineFields,
  type Run,
  type RunFields,
  type Supplement,
  type Workout,
  type WorkoutChange,
  type WorkoutExercise,
} from "@/lib/fitness-types";

// The Fitness app's data for the whole app (FitnessApp): the user's routines,
// workouts, runs, supplements, daily log and goals, in one answer, loaded with
// the app, again when the page is shown again, and kept in this browser for
// offline use (components/common/QueryProvider).
//
// Changes show at once: what is shown is the last state the server sent with
// the changes not yet confirmed (those waiting for the connection too) applied
// on top. Each change is plain data, sent one at a time in the order made (a
// workout is created before its sets are changed), and can wait in this
// browser for the connection, even across a reload. Each is safe to send
// twice: a create with an id the server has is answered with what is there,
// a delete of what's gone is no matter, and the rest set values, not add to
// them (a glass of water sends the day's new total).

/** Calls /api/fitness{path} and returns its data, or throws an ApiError with its message. */
export function fitnessRequest<T>(
  path: string,
  options: { method?: string; body?: object; signal?: AbortSignal } = {},
): Promise<T> {
  return apiRequest<T>(`/api/fitness${path}`, { ...options, fallback: "Something went wrong. Try again." });
}

export const fitnessKey = ["fitness", "/"] as const;
const changeKey = ["fitness", "change"] as const;
const scope = { id: "fitness" };

type Change =
  | { kind: "routine-create"; routine: Routine }
  | { kind: "routine-update"; id: string; fields: Partial<RoutineFields> }
  | { kind: "routine-delete"; id: string }
  | { kind: "workout-create"; workout: Workout }
  | { kind: "workout-update"; id: string; fields: WorkoutChange }
  | { kind: "workout-delete"; id: string }
  | { kind: "run-create"; run: Run }
  | { kind: "run-update"; id: string; fields: Partial<RunFields> }
  | { kind: "run-delete"; id: string }
  | { kind: "supplement-create"; supplement: Supplement }
  | { kind: "supplement-delete"; id: string }
  | { kind: "day"; date: string; fields: DayFields }
  | { kind: "goals"; fields: Partial<Goals> };

const upsert = <T extends { id: string }>(items: readonly T[], item: T) => [
  ...items.filter((other) => other.id !== item.id),
  item,
];
const patch = <T extends { id: string }>(items: readonly T[], id: string, fields: Partial<NoInfer<T>>) =>
  items.map((item) => (item.id === id ? { ...item, ...fields } : item));
const without = <T extends { id: string }>(items: readonly T[], id: string) => items.filter((item) => item.id !== id);

function withDayChanged(data: FitnessData, day: Day): FitnessData {
  const others = data.days.filter((other) => other.date !== day.date);
  return { ...data, days: isEmptyDay(day) ? others : [...others, day] };
}

// A change applied on screen, before the server has it.
function applyChange(data: FitnessData, change: Change): FitnessData {
  switch (change.kind) {
    case "routine-create":
      return { ...data, routines: upsert(data.routines, change.routine) };
    case "routine-update":
      return { ...data, routines: patch(data.routines, change.id, change.fields) };
    case "routine-delete":
      return {
        ...data,
        routines: without(data.routines, change.id),
        workouts: data.workouts.map((w) => (w.routineId === change.id ? { ...w, routineId: null } : w)),
      };
    case "workout-create":
      return { ...data, workouts: upsert(data.workouts, change.workout) };
    case "workout-update":
      return { ...data, workouts: patch(data.workouts, change.id, change.fields) };
    case "workout-delete":
      return { ...data, workouts: without(data.workouts, change.id) };
    case "run-create":
      return { ...data, runs: upsert(data.runs, change.run) };
    case "run-update":
      return { ...data, runs: patch(data.runs, change.id, change.fields) };
    case "run-delete":
      return { ...data, runs: without(data.runs, change.id) };
    case "supplement-create":
      return { ...data, supplements: upsert(data.supplements, change.supplement) };
    case "supplement-delete":
      return { ...data, supplements: without(data.supplements, change.id) };
    case "day":
      return withDayChanged(data, withDay(dayOf(data.days, change.date), change.fields));
    case "goals":
      return { ...data, goals: { ...data.goals, ...change.fields } };
  }
}

// What is gone already is no matter: a delete sent twice, or after another device's.
const unlessGone = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404) return null;
  throw error;
};

function send(change: Change): Promise<unknown> {
  switch (change.kind) {
    case "routine-create": {
      const { id, name, exercises, notes } = change.routine;
      return fitnessRequest<Routine>("/routines", { method: "POST", body: { id, name, exercises, notes } });
    }
    case "routine-update":
      return fitnessRequest<Routine>(`/routines/${change.id}`, { method: "PATCH", body: change.fields });
    case "routine-delete":
      return fitnessRequest<null>(`/routines/${change.id}`, { method: "DELETE" }).catch(unlessGone);
    case "workout-create": {
      const { id, date, name, routineId, exercises, notes } = change.workout;
      return fitnessRequest<Workout>("/workouts", {
        method: "POST",
        body: { id, date, name, routineId, exercises, notes },
      });
    }
    case "workout-update":
      return fitnessRequest<Workout>(`/workouts/${change.id}`, { method: "PATCH", body: change.fields });
    case "workout-delete":
      return fitnessRequest<null>(`/workouts/${change.id}`, { method: "DELETE" }).catch(unlessGone);
    case "run-create": {
      const { id, date, distanceM, durationS, notes } = change.run;
      return fitnessRequest<Run>("/runs", { method: "POST", body: { id, date, distanceM, durationS, notes } });
    }
    case "run-update":
      return fitnessRequest<Run>(`/runs/${change.id}`, { method: "PATCH", body: change.fields });
    case "run-delete":
      return fitnessRequest<null>(`/runs/${change.id}`, { method: "DELETE" }).catch(unlessGone);
    case "supplement-create": {
      const { id, name, dose } = change.supplement;
      return fitnessRequest<Supplement>("/supplements", { method: "POST", body: { id, name, dose } });
    }
    case "supplement-delete":
      return fitnessRequest<null>(`/supplements/${change.id}`, { method: "DELETE" }).catch(unlessGone);
    case "day":
      return fitnessRequest<Day>(`/days/${change.date}`, { method: "PATCH", body: change.fields });
    case "goals":
      return fitnessRequest<Goals>("/goals", { method: "PATCH", body: change.fields });
  }
}

// The server's answer to a change, put in what it last sent.
function keepAnswer(data: FitnessData, change: Change, answer: unknown): FitnessData {
  switch (change.kind) {
    case "routine-create":
    case "routine-update":
      return { ...data, routines: upsert(data.routines, answer as Routine) };
    case "workout-create":
    case "workout-update":
      return { ...data, workouts: upsert(data.workouts, answer as Workout) };
    case "run-create":
    case "run-update":
      return { ...data, runs: upsert(data.runs, answer as Run) };
    case "supplement-create":
      return { ...data, supplements: upsert(data.supplements, answer as Supplement) };
    case "day":
      return withDayChanged(data, answer as Day);
    case "goals":
      return { ...data, goals: answer as Goals };
    default:
      return applyChange(data, change);
  }
}

/**
 * Registers how changes are sent (QueryProvider's setup), so the ones kept from
 * before a reload go out too. Once the server has one, its answer is put in
 * what it last sent; one it refused is dropped, which undoes it on screen, and
 * everything loads again after a 404 or 409 (changed on another device meanwhile).
 */
export function setupFitness(client: QueryClient) {
  client.setMutationDefaults(changeKey, {
    mutationFn: (change: Change) => send(change),
    scope,
    onSuccess: async (answer, change) => {
      await client.cancelQueries({ queryKey: ["fitness"] });
      client.setQueryData<FitnessData>(fitnessKey, (data) => data && sortFitness(keepAnswer(data, change, answer)));
    },
    onError: (error) => {
      if (error instanceof ApiError && [404, 409].includes(error.status))
        void client.invalidateQueries({ queryKey: ["fitness"] });
    },
  });
}

/** Today in Lisbon (a calendar date), and again each minute, so a page left open past midnight moves on. */
function useToday(): string {
  const [today, setToday] = useState(() => localParts(new Date()).date);
  useEffect(() => {
    const timer = setInterval(() => setToday(localParts(new Date()).date), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

/** The id an exercise removed from a workout waits for its Undo under (in the workout's dialog). */
export const exerciseUndoId = (exerciseId: string) => `exercise:${exerciseId}`;
/** The id a supplement removed waits for its Undo under (in Supplements). */
export const supplementUndoId = (supplementId: string) => `supplement:${supplementId}`;

export type FitnessContextValue = {
  /** Everything, newest workouts and runs first; null until it has loaded. */
  data: FitnessData | null;
  /** Today in Lisbon. */
  today: string;
  /** Why the last load failed ("" once one works), also while what was kept from before is shown. */
  loadError: string;
  /** Why the last refused change was undone. */
  error: string;
  dismissError: () => void;
  reload: () => void;
  createRoutine: (routine: Routine) => void;
  updateRoutine: (id: string, fields: Partial<RoutineFields>) => void;
  removeRoutine: (id: string) => void;
  createWorkout: (workout: Workout) => void;
  updateWorkout: (id: string, fields: WorkoutChange) => void;
  /** Changes a workout's exercises from what they are now (with the changes not sent yet). */
  updateExercises: (id: string, change: (exercises: WorkoutExercise[]) => WorkoutExercise[]) => void;
  removeWorkout: (id: string) => void;
  createRun: (run: Run) => void;
  updateRun: (id: string, fields: Partial<RunFields>) => void;
  removeRun: (id: string) => void;
  createSupplement: (supplement: Supplement) => void;
  removeSupplement: (id: string) => void;
  /** Changes a day of the log from what it is now (a glass of water more, a supplement ticked off). */
  updateDay: (date: string, change: (day: Day) => DayFields) => void;
  updateGoals: (fields: Partial<Goals>) => void;
  /** Deletes wait for their Undo (components/common/Undo). */
  undo: ReturnType<typeof useUndo>;
  /** What is waiting for its Undo, hidden meanwhile: workouts', runs', routines' ids, and exercise:<id>, supplement:<id>. */
  hidden: ReadonlySet<string>;
};

const FitnessContext = createContext<FitnessContextValue | null>(null);

export function useFitness(): FitnessContextValue {
  const value = useContext(FitnessContext);
  if (!value) throw new Error("useFitness must be used inside a FitnessProvider");
  return value;
}

/**
 * Starts a workout on a day and returns its id: from a routine (its exercises
 * and sets, at the weights of the last time), or an empty one, "Workout".
 * Opening it is the caller's (from a dialog, once that has closed).
 */
export function useStartWorkout() {
  const { data, createWorkout } = useFitness();
  return (date: string, routine?: Routine) => {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    createWorkout(
      routine
        ? workoutFromRoutine(routine, data?.workouts ?? [], { id, date, createdAt, newId: () => crypto.randomUUID() })
        : { id, date, name: "Workout", routineId: null, exercises: [], notes: "", createdAt, updatedAt: createdAt },
    );
    return id;
  };
}

export function FitnessProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: fitnessKey,
    queryFn: ({ signal }) => fitnessRequest<FitnessData>("", { signal }),
    meta: { persist: true },
  });
  const pending = useMutationState({
    filters: { mutationKey: changeKey, status: "pending" },
    select: (mutation) => mutation.state.variables as Change,
  });
  const refused = useMutationState({
    filters: { mutationKey: changeKey, status: "error" },
    select: (mutation) => ({
      at: mutation.state.submittedAt,
      message: (mutation.state.error as Error | null)?.message,
    }),
  }).at(-1);
  const [dismissedAt, setDismissedAt] = useState(0);
  const error = refused && refused.at >= dismissedAt ? `${refused.message} Your change was undone.` : "";
  const { mutate } = useMutation<unknown, Error, Change>({ mutationKey: changeKey });
  const undo = useUndo();
  const today = useToday();

  const shown = useMemo(
    () => (query.data ? sortFitness(pending.reduce(applyChange, query.data)) : null),
    [query.data, pending],
  );
  // What is shown now, for changes made from it later (an Undo's commit, a tap after another).
  const latest = useRef(shown);
  useEffect(() => {
    latest.current = shown;
  }, [shown]);

  const hiddenKey = undo.pending?.id ?? "";
  const hidden = useMemo(() => new Set(hiddenKey.split(" ").filter(Boolean)), [hiddenKey]);

  const value = useMemo<FitnessContextValue>(() => {
    const change = (next: Change) => {
      setDismissedAt(Date.now());
      // Applied to what is shown at once, so a second tap before the next render builds on it.
      if (latest.current) latest.current = sortFitness(applyChange(latest.current, next));
      mutate(next);
    };
    return {
      data: shown,
      today,
      loadError: query.error?.message ?? "",
      error,
      dismissError: () => setDismissedAt(Date.now()),
      reload: () => void client.invalidateQueries({ queryKey: ["fitness"] }),
      createRoutine: (routine) => change({ kind: "routine-create", routine }),
      updateRoutine: (id, fields) => change({ kind: "routine-update", id, fields }),
      removeRoutine: (id) => change({ kind: "routine-delete", id }),
      createWorkout: (workout) => change({ kind: "workout-create", workout }),
      updateWorkout: (id, fields) => change({ kind: "workout-update", id, fields }),
      updateExercises: (id, next) => {
        const workout = latest.current?.workouts.find((w) => w.id === id);
        if (workout) change({ kind: "workout-update", id, fields: { exercises: next(workout.exercises) } });
      },
      removeWorkout: (id) => change({ kind: "workout-delete", id }),
      createRun: (run) => change({ kind: "run-create", run }),
      updateRun: (id, fields) => change({ kind: "run-update", id, fields }),
      removeRun: (id) => change({ kind: "run-delete", id }),
      createSupplement: (supplement) => change({ kind: "supplement-create", supplement }),
      removeSupplement: (id) => change({ kind: "supplement-delete", id }),
      updateDay: (date, next) => {
        if (!latest.current) return;
        change({ kind: "day", date, fields: next(dayOf(latest.current.days, date)) });
      },
      updateGoals: (fields) => change({ kind: "goals", fields }),
      undo,
      hidden,
    };
  }, [shown, today, query.error, error, client, mutate, undo, hidden]);

  return <FitnessContext value={value}>{children}</FitnessContext>;
}
