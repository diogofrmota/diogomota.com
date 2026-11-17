"use client";
import { useId, useMemo, useState, type FormEvent } from "react";
import { CheckIcon, MinusIcon, PlusIcon, TrashIcon, TrophyIcon } from "@/components/common/icons";
import { successPulse } from "@/components/common/motion";
import { Spinner } from "@/components/common/Spinner";
import { Button, SrOnly } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { MaskedField } from "@/components/shared/MaskedField";
import { useAppView } from "@/hooks/useAppView";
import {
  fitnessLimits,
  formatNumber,
  knownExercises,
  lastTime,
  nextSet,
  parseCount,
  parseDecimal,
  recordSets,
  roundTo,
  setsLine,
  shortDate,
  tidy,
  workoutLine,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from "@/lib/fitness-types";
import { exerciseUndoId, useFitness } from "./fitness-data";
import { Sheet } from "./Sheet";
import styles from "./Fitness.module.css";

const asText = (value: number | null) => (value === null ? "" : String(value));

/** A weight as typed, to the nearest 0.01 kg; null when it isn't one (0 to 1,000 kg). */
function readKg(text: string): number | null {
  const kg = parseDecimal(text);
  return kg !== null && kg <= fitnessLimits.weightKg ? roundTo(kg, 0.01) : null;
}

/** Reps as typed; null when they aren't a whole number from 0 to 1,000. */
function readReps(text: string): number | null {
  const reps = parseCount(text);
  return reps !== null && reps <= fitnessLimits.reps ? reps : null;
}

/**
 * A set: its weight and reps, typed (saved once the field is left, or Enter),
 * and its tick, which marks it done (and saves what is typed with it). Empty
 * fields show the last time's set, which a tick takes. A personal record has
 * a trophy by its number.
 */
function SetRow({
  set,
  index,
  last,
  record,
  onChange,
}: {
  set: WorkoutSet;
  index: number;
  /** The same set the last time, if there was one. */
  last: WorkoutSet | undefined;
  record: boolean;
  onChange: (set: WorkoutSet) => void;
}) {
  const [kg, setKg] = useState(asText(set.weightKg));
  const [reps, setReps] = useState(asText(set.reps));
  // A new value from elsewhere (another device, Undo) replaces what is typed.
  const [seen, setSeen] = useState(set);
  if (seen.weightKg !== set.weightKg || seen.reps !== set.reps) {
    setSeen(set);
    setKg(asText(set.weightKg));
    setReps(asText(set.reps));
  }
  const n = index + 1;

  /** What is typed, with `extra` (the tick); a field that isn't a number goes back to what it was. */
  function commit(extra: Partial<WorkoutSet> = {}) {
    const next: WorkoutSet = {
      weightKg: kg.trim() ? (readKg(kg) ?? set.weightKg) : null,
      reps: reps.trim() ? (readReps(reps) ?? set.reps) : null,
      done: set.done,
      ...extra,
    };
    setKg(asText(next.weightKg));
    setReps(asText(next.reps));
    if (next.reps !== set.reps || next.weightKg !== set.weightKg || next.done !== set.done) onChange(next);
  }

  const field = (value: string, setValue: (text: string) => void, label: string, hint: number | null) => (
    <input
      className={styles.setInput}
      aria-label={label}
      value={value}
      placeholder={hint === null ? "" : String(hint)}
      inputMode={label.includes("kg") ? "decimal" : "numeric"}
      autoComplete="off"
      enterKeyHint="done"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );

  return (
    <tr className={styles.setRow} data-done={set.done || undefined}>
      <th scope="row" className={styles.setNumber}>
        {n}
        {record && (
          <>
            <SrOnly>, a personal record</SrOnly>
            <span className={styles.prMark} title="Personal record" aria-hidden="true">
              <TrophyIcon />
            </span>
          </>
        )}
      </th>
      <td>{field(kg, setKg, `Set ${n} weight in kg`, last?.weightKg ?? null)}</td>
      <td>{field(reps, setReps, `Set ${n} reps`, last?.reps ?? null)}</td>
      <td>
        <button
          type="button"
          className={styles.doneButton}
          aria-label={`Set ${n} done`}
          aria-pressed={set.done}
          onClick={(e) => {
            const done = !set.done;
            if (done) successPulse(e.currentTarget);
            // Ticked with empty fields: the last time's set.
            commit({
              done,
              ...(done && !kg.trim() && last?.weightKg ? { weightKg: last.weightKg } : {}),
              ...(done && !reps.trim() && last?.reps ? { reps: last.reps } : {}),
            });
          }}
        >
          <CheckIcon />
        </button>
      </td>
    </tr>
  );
}

/** An exercise of the workout: the last time's sets, its own (weight, reps, done), Add set and Remove set. */
function Exercise({
  workout,
  exercise,
  workouts,
  records,
}: {
  workout: Workout;
  exercise: WorkoutExercise;
  workouts: readonly Workout[];
  records: ReadonlySet<string>;
}) {
  const { updateExercises, undo, today } = useFitness();
  const id = useId();
  const last = lastTime(workouts, exercise.name, workout);
  const setSets = (change: (sets: WorkoutSet[]) => WorkoutSet[]) =>
    updateExercises(workout.id, (exercises) =>
      exercises.map((e) => (e.id === exercise.id ? { ...e, sets: change(e.sets) } : e)),
    );
  return (
    <section className={styles.exercise} aria-labelledby={id}>
      <div className={styles.exerciseHeader}>
        <h3 id={id}>{exercise.name}</h3>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Remove ${exercise.name}`}
          onClick={() =>
            undo.schedule({
              label: `Removed “${exercise.name}”`,
              id: exerciseUndoId(exercise.id),
              commit: () => updateExercises(workout.id, (exercises) => exercises.filter((e) => e.id !== exercise.id)),
            })
          }
        >
          <TrashIcon />
        </button>
      </div>
      {last && (
        <p className={styles.lastTime}>
          Last time, {shortDate(last.date, today)}: {setsLine(last.sets)}
        </p>
      )}
      {exercise.sets.length > 0 && (
        <table className={styles.sets}>
          <thead>
            <tr>
              <th scope="col">Set</th>
              <th scope="col">kg</th>
              <th scope="col">Reps</th>
              <th scope="col">
                <SrOnly>Done</SrOnly>
              </th>
            </tr>
          </thead>
          <tbody>
            {exercise.sets.map((set, i) => (
              <SetRow
                key={i}
                set={set}
                index={i}
                last={last ? (last.sets[i] ?? last.sets.at(-1)) : undefined}
                record={records.has(`${exercise.id}:${i}`)}
                onChange={(next) => setSets((sets) => sets.map((s, j) => (j === i ? next : s)))}
              />
            ))}
          </tbody>
        </table>
      )}
      <div className={styles.setActions}>
        <Button
          variant="quiet"
          aria-label={`Add set to ${exercise.name}`}
          disabled={exercise.sets.length >= fitnessLimits.sets}
          onClick={() => setSets((sets) => [...sets, nextSet(sets)])}
        >
          <PlusIcon />
          Add set
        </Button>
        {exercise.sets.length > 0 && (
          <Button
            variant="quiet"
            aria-label={`Remove set from ${exercise.name}`}
            onClick={() => setSets((sets) => sets.slice(0, -1))}
          >
            <MinusIcon />
            Remove set
          </Button>
        )}
      </div>
    </section>
  );
}

/** An exercise just removed, in its place, with its Undo (paused while the pointer or focus is on it, as the page's is). */
function Removed({ name }: { name: string }) {
  const { undo } = useFitness();
  return (
    <div
      role="status"
      className={styles.removed}
      onPointerEnter={undo.pause}
      onPointerLeave={undo.resume}
      onFocus={undo.pause}
      onBlur={undo.resume}
    >
      {name} removed.
      <Button variant="quiet" onClick={undo.undo}>
        Undo
      </Button>
    </div>
  );
}

/** Add an exercise: its name (the ones written before suggested); its sets as many as the last time. */
function AddExercise({
  workout,
  workouts,
  known,
}: {
  workout: Workout;
  workouts: readonly Workout[];
  known: string[];
}) {
  const { updateExercises } = useFitness();
  const [name, setName] = useState("");
  const id = useId();
  const full = workout.exercises.length >= fitnessLimits.exercises;
  function add(e: FormEvent) {
    e.preventDefault();
    const tidied = tidy(name).slice(0, fitnessLimits.name);
    if (!tidied || full) return;
    const count = Math.max(1, lastTime(workouts, tidied, workout)?.sets.length ?? 1);
    const sets = Array.from({ length: Math.min(count, fitnessLimits.sets) }, () => ({
      reps: null,
      weightKg: null,
      done: false,
    }));
    updateExercises(workout.id, (exercises) => [...exercises, { id: crypto.randomUUID(), name: tidied, sets }]);
    setName("");
  }
  return (
    <form className={styles.addExercise} onSubmit={add}>
      <label htmlFor={id} className={ui.srOnly}>
        Add an exercise
      </label>
      <input
        id={id}
        list={`${id}-known`}
        value={name}
        placeholder={full ? `Up to ${fitnessLimits.exercises} exercises` : "Add an exercise, like Squat"}
        disabled={full}
        maxLength={fitnessLimits.name}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
      />
      <datalist id={`${id}-known`}>
        {known.map((exercise) => (
          <option key={exercise} value={exercise} />
        ))}
      </datalist>
      <Button type="submit" variant="primary" disabled={!name.trim() || full}>
        <PlusIcon />
        Add
      </Button>
    </form>
  );
}

/** The workout's name and day, changed in place (saved once the name's field is left, or a whole date typed). */
function Details({ workout }: { workout: Workout }) {
  const { updateWorkout } = useFitness();
  const [name, setName] = useState(workout.name);
  const [seen, setSeen] = useState(workout.name);
  if (seen !== workout.name) {
    setSeen(workout.name);
    setName(workout.name);
  }
  const id = useId();
  return (
    <div className={styles.details}>
      <label className={styles.field} htmlFor={`${id}-name`}>
        Name
        <input
          id={`${id}-name`}
          value={name}
          maxLength={fitnessLimits.name}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const tidied = tidy(name);
            if (!tidied) setName(workout.name);
            else if (tidied !== workout.name) updateWorkout(workout.id, { name: tidied });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
      <label className={`${styles.field} ${styles.dateField}`}>
        Day
        <MaskedField
          kind="date"
          label="Day"
          value={workout.date}
          onChange={(date) => updateWorkout(workout.id, { date })}
        />
      </label>
    </div>
  );
}

/** The workout's notes, saved once the field is left. */
function Notes({ workout }: { workout: Workout }) {
  const { updateWorkout } = useFitness();
  const [notes, setNotes] = useState(workout.notes);
  const [seen, setSeen] = useState(workout.notes);
  if (seen !== workout.notes) {
    setSeen(workout.notes);
    setNotes(workout.notes);
  }
  return (
    <label className={styles.field}>
      Notes
      <textarea
        rows={2}
        value={notes}
        maxLength={fitnessLimits.notes}
        placeholder="How it went, what to change next time"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes.trim() !== workout.notes) updateWorkout(workout.id, { notes: notes.trim() });
        }}
      />
    </label>
  );
}

function WorkoutBody({ workout, workouts }: { workout: Workout; workouts: readonly Workout[] }) {
  const { data, hidden, removeWorkout, undo } = useFitness();
  const { closePanel } = useAppView();
  const records = useMemo(() => recordSets(workout, workouts), [workout, workouts]);
  const known = useMemo(() => knownExercises(data?.routines ?? [], workouts), [data?.routines, workouts]);
  const shown = { ...workout, exercises: workout.exercises.filter((e) => !hidden.has(exerciseUndoId(e.id))) };
  return (
    <>
      <Details workout={workout} />
      <p className={styles.summary} aria-live="polite">
        {workoutLine(shown)}
        {records.size > 0 && (
          <span className={styles.recordNote}>
            <TrophyIcon />
            {records.size === 1 ? "A personal record" : `${formatNumber(records.size)} personal records`}
          </span>
        )}
      </p>
      {workout.exercises.map((exercise) =>
        hidden.has(exerciseUndoId(exercise.id)) ? (
          <Removed key={exercise.id} name={exercise.name} />
        ) : (
          <Exercise key={exercise.id} workout={workout} exercise={exercise} workouts={workouts} records={records} />
        ),
      )}
      {workout.exercises.length === 0 && (
        <p className={styles.empty}>Add the exercises you do, one at a time, and their sets as you go.</p>
      )}
      <AddExercise workout={workout} workouts={workouts} known={known} />
      <Notes workout={workout} />
      <div className={styles.dialogFooter}>
        {/* Everything is saved already: Done only closes it, as × does, here at the end of a long workout. */}
        <Button variant="primary" onClick={closePanel}>
          Done
        </Button>
        <Button
          variant="remove"
          onClick={() => {
            closePanel();
            undo.schedule({
              label: `Deleted “${workout.name}”`,
              id: workout.id,
              commit: () => removeWorkout(workout.id),
            });
          }}
        >
          <TrashIcon />
          Delete workout
        </Button>
      </div>
    </>
  );
}

/**
 * A workout (workout:<id>): its name and day, then each exercise with the last
 * time's sets and its own, weight, reps and a tick each, a trophy on a personal
 * record; Add an exercise; notes; and Delete workout, which closes it with Undo.
 * Everything is saved as it is done.
 */
export function WorkoutDialog({ id }: { id: string }) {
  const { data, loadError, hidden } = useFitness();
  const { closePanel } = useAppView();
  const workout = hidden.has(id) ? undefined : data?.workouts.find((w) => w.id === id);
  if (!workout || !data)
    return (
      <Sheet title={data || loadError ? "Workout not found" : "Workout"} onClose={closePanel}>
        {data || loadError ? (
          <p className={ui.muted}>{loadError || "It may have been deleted, on this device or another."}</p>
        ) : (
          <Spinner label="Loading the workout…" />
        )}
      </Sheet>
    );
  return (
    <Sheet title={workout.name} onClose={closePanel} wide>
      <WorkoutBody workout={workout} workouts={data.workouts} />
    </Sheet>
  );
}
