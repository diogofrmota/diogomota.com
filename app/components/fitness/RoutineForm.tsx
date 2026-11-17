"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon, TrashIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import {
  defaultTarget,
  fitnessLimits,
  knownExercises,
  parseCount,
  tidy,
  type Routine,
  type RoutineExercise,
  type RoutineFields,
} from "@/lib/fitness-types";
import { useFitness } from "./fitness-data";
import { Sheet } from "./Sheet";
import styles from "./Fitness.module.css";

/** An exercise's row as typed. */
type Row = { key: string; name: string; sets: string; reps: string };

const newRow = (): Row => ({
  key: crypto.randomUUID(),
  name: "",
  sets: String(defaultTarget.sets),
  reps: String(defaultTarget.reps),
});

type Errors = { name?: string; exercises?: string; rows?: Record<string, string> };

/** The rows' exercises, or why they can't be saved. */
function readRows(rows: readonly Row[]): {
  exercises: RoutineExercise[];
  rows: Record<string, string>;
  error?: string;
} {
  const filled = rows.filter((row) => tidy(row.name));
  const errors: Record<string, string> = {};
  const exercises: RoutineExercise[] = [];
  for (const row of filled) {
    const sets = parseCount(row.sets);
    const reps = parseCount(row.reps);
    if (tidy(row.name).length > fitnessLimits.name)
      errors[row.key] = `Keep the exercise's name to ${fitnessLimits.name} characters.`;
    else if (sets === null || sets < 1 || sets > fitnessLimits.targetSets)
      errors[row.key] = `Enter from 1 to ${fitnessLimits.targetSets} sets.`;
    else if (reps === null || reps < 1 || reps > fitnessLimits.targetReps)
      errors[row.key] = `Enter from 1 to ${fitnessLimits.targetReps} reps.`;
    else exercises.push({ name: tidy(row.name), sets, reps });
  }
  const error = !filled.length
    ? "Add at least one exercise."
    : filled.length > fitnessLimits.exercises
      ? `A routine can have up to ${fitnessLimits.exercises} exercises.`
      : undefined;
  return { exercises, rows: errors, error };
}

/** A row: the exercise's name, its sets × reps, and Move up, Move down and Remove. */
function ExerciseRow({
  row,
  index,
  count,
  listId,
  error,
  onChange,
  onMove,
  onRemove,
}: {
  row: Row;
  index: number;
  count: number;
  listId: string;
  error?: string;
  onChange: (row: Row) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const errorId = useId();
  const invalid = { "aria-invalid": !!error || undefined, "aria-describedby": error ? errorId : undefined };
  return (
    <li className={styles.exerciseRow}>
      <input
        className={styles.exerciseName}
        aria-label={`Exercise ${n}`}
        list={listId}
        value={row.name}
        placeholder={index === 0 ? "Bench press" : "Exercise"}
        maxLength={fitnessLimits.name}
        autoComplete="off"
        onChange={(e) => onChange({ ...row, name: e.target.value })}
      />
      <span className={styles.targets}>
        <label>
          <span>Sets</span>
          <input
            aria-label={`Sets of exercise ${n}`}
            value={row.sets}
            inputMode="numeric"
            autoComplete="off"
            {...invalid}
            onChange={(e) => onChange({ ...row, sets: e.target.value })}
          />
        </label>
        <span aria-hidden="true">×</span>
        <label>
          <span>Reps</span>
          <input
            aria-label={`Reps of exercise ${n}`}
            value={row.reps}
            inputMode="numeric"
            autoComplete="off"
            {...invalid}
            onChange={(e) => onChange({ ...row, reps: e.target.value })}
          />
        </label>
      </span>
      <span className={styles.rowTools}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Move exercise ${n} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Move exercise ${n} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Remove exercise ${n}`}
          disabled={count === 1}
          onClick={onRemove}
        >
          <CloseIcon />
        </button>
      </span>
      {error && (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      )}
    </li>
  );
}

function RoutineFormBody({ routine }: { routine?: Routine }) {
  const { data, createRoutine, updateRoutine, removeRoutine, undo } = useFitness();
  const { closePanel } = useAppView();
  const [rows, setRows] = useState<Row[]>(() =>
    routine
      ? routine.exercises.map((exercise) => ({
          key: crypto.randomUUID(),
          name: exercise.name,
          sets: String(exercise.sets),
          reps: String(exercise.reps),
        }))
      : [newRow()],
  );
  const [errors, setErrors] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const known = knownExercises(data?.routines ?? [], data?.workouts ?? []);

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = tidy(String(formData.get("name") ?? ""));
    const notes = String(formData.get("notes") ?? "").trim();
    const read = readRows(rows);
    const found: Errors = { rows: read.rows };
    if (!name) found.name = "Enter a name, like Push day.";
    else if (name.length > fitnessLimits.name) found.name = `Keep the name to ${fitnessLimits.name} characters.`;
    if (read.error) found.exercises = read.error;
    setErrors(found);
    if (found.name || found.exercises || Object.keys(read.rows).length) {
      // The first field that needs fixing, to fix it.
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    const fields: RoutineFields = { name, exercises: read.exercises, notes };
    if (routine) {
      const changed = Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => JSON.stringify(routine[key as keyof RoutineFields]) !== JSON.stringify(value),
        ),
      ) as Partial<RoutineFields>;
      if (Object.keys(changed).length) updateRoutine(routine.id, changed);
    } else {
      const now = new Date().toISOString();
      createRoutine({ id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now });
    }
    closePanel();
  }

  const move = (index: number, by: -1 | 1) =>
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const failed = !!(errors.name || errors.exercises || Object.keys(errors.rows ?? {}).length);

  return (
    <form ref={form} className={styles.form} onSubmit={save} noValidate>
      {failed && <Alert>Check the fields marked below.</Alert>}
      <label className={styles.field}>
        Name
        <input
          name="name"
          defaultValue={routine?.name}
          placeholder="Push day"
          maxLength={fitnessLimits.name}
          autoComplete="off"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? `${id}-name` : undefined}
          data-autofocus
        />
        {errors.name && (
          <p id={`${id}-name`} className={styles.fieldError}>
            {errors.name}
          </p>
        )}
      </label>
      <fieldset className={styles.fieldset} aria-describedby={errors.exercises ? `${id}-exercises` : undefined}>
        <legend>Exercises</legend>
        <ol className={styles.exerciseRows}>
          {rows.map((row, i) => (
            <ExerciseRow
              key={row.key}
              row={row}
              index={i}
              count={rows.length}
              listId={`${id}-known`}
              error={errors.rows?.[row.key]}
              onChange={(next) => setRows((current) => current.map((r) => (r.key === row.key ? next : r)))}
              onMove={(by) => move(i, by)}
              onRemove={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            />
          ))}
        </ol>
        <datalist id={`${id}-known`}>
          {known.map((exercise) => (
            <option key={exercise} value={exercise} />
          ))}
        </datalist>
        {errors.exercises && (
          <p id={`${id}-exercises`} className={styles.fieldError}>
            {errors.exercises}
          </p>
        )}
        <div>
          <Button
            disabled={rows.length >= fitnessLimits.exercises}
            onClick={() => setRows((current) => [...current, newRow()])}
          >
            <PlusIcon />
            Add exercise
          </Button>
        </div>
      </fieldset>
      <label className={styles.field}>
        Notes
        <textarea
          name="notes"
          rows={2}
          maxLength={fitnessLimits.notes}
          defaultValue={routine?.notes}
          placeholder="Warm-up, rest between sets"
        />
      </label>
      {/* No Cancel: the × at the top closes it without saving. */}
      <div className={ui.actions}>
        <Button variant="primary" type="submit">
          Save
        </Button>
      </div>
      {routine && (
        <div className={styles.deleteRow}>
          <Button
            variant="remove"
            onClick={() => {
              closePanel();
              undo.schedule({
                label: `Deleted “${routine.name}”`,
                id: routine.id,
                commit: () => removeRoutine(routine.id),
              });
            }}
          >
            <TrashIcon />
            Delete routine
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * A routine's form: New routine (new-routine) or Edit routine (routine:<id>).
 * Its name, its exercises in order (each its sets × reps, moved up and down),
 * and notes; Save checks them as the API does and closes. Delete routine closes
 * it with Undo; the workouts started from it stay.
 */
export function RoutineForm({ id }: { id?: string }) {
  const { data, loadError, hidden } = useFitness();
  const { closePanel } = useAppView();
  const routine = id && !hidden.has(id) ? data?.routines.find((r) => r.id === id) : undefined;
  if (id && !routine)
    return (
      <Sheet title={data || loadError ? "Routine not found" : "Edit routine"} onClose={closePanel}>
        {data || loadError ? (
          <p className={ui.muted}>{loadError || "It may have been deleted, on this device or another."}</p>
        ) : (
          <Spinner label="Loading the routine…" />
        )}
      </Sheet>
    );
  return (
    <Sheet title={routine ? "Edit routine" : "New routine"} onClose={closePanel}>
      <RoutineFormBody routine={routine} />
    </Sheet>
  );
}
