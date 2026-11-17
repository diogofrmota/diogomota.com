"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { TrashIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { MaskedField } from "@/components/shared/MaskedField";
import { useAppView } from "@/hooks/useAppView";
import {
  durationOf,
  durationParts,
  fitnessLimits,
  formatPace,
  isDay,
  paceOf,
  parseDecimal,
  type Run,
  type RunFields,
} from "@/lib/fitness-types";
import { useFitness } from "./fitness-data";
import { Sheet } from "./Sheet";
import styles from "./Fitness.module.css";

type Field = "date" | "distance" | "time";

/** A distance as typed, in metres (to the nearest 10 m); null when it isn't one from 0.01 to 500 km. */
function readDistance(text: string): number | null {
  const km = parseDecimal(text);
  if (km === null) return null;
  const metres = Math.round(km * 100) * 10;
  return metres >= fitnessLimits.distanceMinM && metres <= fitnessLimits.distanceMaxM ? metres : null;
}

function RunFormBody({ run, date }: { run?: Run; date: string }) {
  const { today, createRun, updateRun, removeRun, undo } = useFitness();
  const { closePanel } = useAppView();
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [day, setDay] = useState(run?.date ?? date);
  const [distance, setDistance] = useState(run ? String(run.distanceM / 1000) : "");
  const [time, setTime] = useState(() =>
    run ? durationParts(run.durationS) : { hours: "", minutes: "", seconds: "" },
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const metres = readDistance(distance);
  const seconds = durationOf(time.hours, time.minutes, time.seconds);
  const pace = metres && seconds ? formatPace(paceOf({ distanceM: metres, durationS: seconds })) : null;

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const notes = String(new FormData(e.currentTarget).get("notes") ?? "").trim();
    const found: Partial<Record<Field, string>> = {};
    // The day's field holds its last whole date while one is being typed: it says when it isn't one.
    const dayInput = e.currentTarget.querySelector<HTMLInputElement>("input[aria-label='Day']");
    if (!isDay(day) || (dayInput && !dayInput.validity.valid)) found.date = "Enter the day as dd/mm/yyyy.";
    else if (day > today) found.date = "Enter a day up to today.";
    if (metres === null) found.distance = "Enter the distance in km, like 5.2.";
    if (seconds === null) found.time = "Enter the time, like 28 minutes 30 seconds (minutes and seconds up to 59).";
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    const fields: RunFields = { date: day, distanceM: metres!, durationS: seconds!, notes };
    if (run) {
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([key, value]) => run[key as keyof RunFields] !== value),
      ) as Partial<RunFields>;
      if (Object.keys(changed).length) updateRun(run.id, changed);
    } else {
      const now = new Date().toISOString();
      createRun({ id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now });
    }
    closePanel();
  }

  const invalid = (field: Field) => ({
    "aria-invalid": !!errors[field] || undefined,
    "aria-describedby": errors[field] ? `${id}-${field}` : undefined,
  });
  const error = (field: Field) =>
    errors[field] && (
      <p id={`${id}-${field}`} className={styles.fieldError}>
        {errors[field]}
      </p>
    );
  const timePart = (part: keyof typeof time, label: string, unit: string) => (
    <label className={styles.timePart}>
      <input
        aria-label={label}
        value={time[part]}
        inputMode="numeric"
        maxLength={2}
        autoComplete="off"
        placeholder="0"
        {...invalid("time")}
        onChange={(e) => setTime((current) => ({ ...current, [part]: e.target.value.replace(/\D/g, "") }))}
      />
      <span aria-hidden="true">{unit}</span>
    </label>
  );

  const failed = Object.keys(errors).length > 0;
  return (
    <form ref={form} className={styles.form} onSubmit={save} noValidate>
      {failed && <Alert>Check the fields marked below.</Alert>}
      <label className={`${styles.field} ${styles.dateField}`}>
        Day
        <MaskedField kind="date" label="Day" value={day} onChange={setDay} />
        {error("date")}
      </label>
      <div className={styles.runFields}>
        <label className={styles.field}>
          Distance
          <span className={styles.entryField}>
            <input
              value={distance}
              inputMode="decimal"
              autoComplete="off"
              placeholder="5.0"
              data-autofocus
              aria-label="Distance in km"
              {...invalid("distance")}
              onChange={(e) => setDistance(e.target.value)}
            />
            <span className={styles.entryUnit} aria-hidden="true">
              km
            </span>
          </span>
          {error("distance")}
        </label>
        <fieldset className={styles.fieldset}>
          <legend>Time</legend>
          <span className={styles.timeParts}>
            {timePart("hours", "Hours", "h")}
            {timePart("minutes", "Minutes", "min")}
            {timePart("seconds", "Seconds", "s")}
          </span>
          {error("time")}
        </fieldset>
      </div>
      <p className={styles.pace} aria-live="polite">
        Pace <output>{pace ?? "–"}</output>
      </p>
      <label className={styles.field}>
        Notes
        <textarea
          name="notes"
          rows={2}
          maxLength={fitnessLimits.notes}
          defaultValue={run?.notes}
          placeholder="Where, how it felt"
        />
      </label>
      <div className={ui.actions}>
        <Button variant="primary" type="submit">
          Save
        </Button>
      </div>
      {run && (
        <div className={styles.deleteRow}>
          <Button
            variant="remove"
            onClick={() => {
              closePanel();
              undo.schedule({ label: "Deleted the run", id: run.id, commit: () => removeRun(run.id) });
            }}
          >
            <TrashIcon />
            Delete run
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * Log a run (new-run:<date>) or a run (run:<id>): its day, distance in km and
 * time (hours, minutes, seconds), with the pace worked out as it's typed, and
 * notes. Save checks them and closes; Delete run closes it with Undo.
 */
export function RunForm({ id, date = "" }: { id?: string; date?: string }) {
  const { data, loadError, hidden, today } = useFitness();
  const { closePanel } = useAppView();
  const run = id && !hidden.has(id) ? data?.runs.find((r) => r.id === id) : undefined;
  if (id && !run)
    return (
      <Sheet title={data || loadError ? "Run not found" : "Run"} onClose={closePanel}>
        {data || loadError ? (
          <p className={ui.muted}>{loadError || "It may have been deleted, on this device or another."}</p>
        ) : (
          <Spinner label="Loading the run…" />
        )}
      </Sheet>
    );
  return (
    <Sheet title={run ? "Run" : "Log a run"} onClose={closePanel}>
      <RunFormBody run={run} date={isDay(date) && date <= today ? date : today} />
    </Sheet>
  );
}
