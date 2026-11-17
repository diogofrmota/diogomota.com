"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { PillIcon, PlusIcon, TrashIcon } from "@/components/common/icons";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { fitnessLimits, formatNumber, parseCount, tidy } from "@/lib/fitness-types";
import { supplementUndoId, useFitness } from "./fitness-data";
import { Sheet } from "./Sheet";
import styles from "./Fitness.module.css";

/**
 * Supplements (panel supplements): the ones taken each day, ticked off on
 * Today, each with its dose and a bin (at once, with Undo here); Add one, its
 * name and dose.
 */
export function SupplementsDialog() {
  const { data, hidden, createSupplement, removeSupplement, undo } = useFitness();
  const { closePanel } = useAppView();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const all = data?.supplements ?? [];
  const supplements = all.filter((s) => !hidden.has(supplementUndoId(s.id)));
  const removed = all.find((s) => undo.pending?.id === supplementUndoId(s.id));
  const full = supplements.length >= fitnessLimits.supplements;

  function add(e: FormEvent) {
    e.preventDefault();
    const tidied = tidy(name);
    if (!tidied) {
      setError("Enter the supplement's name, like Creatine.");
      nameField.current?.focus();
      return;
    }
    if (full) return;
    setError("");
    createSupplement({
      id: crypto.randomUUID(),
      name: tidied.slice(0, fitnessLimits.supplementName),
      dose: tidy(dose).slice(0, fitnessLimits.dose),
      createdAt: new Date().toISOString(),
    });
    setName("");
    setDose("");
    nameField.current?.focus();
  }

  return (
    <Sheet title="Supplements" onClose={closePanel}>
      <p className={styles.sheetLead}>What you take each day, to tick off on Today.</p>
      {supplements.length > 0 && (
        <ul className={styles.supplementList} aria-label="Your supplements">
          {supplements.map((supplement) => (
            <li key={supplement.id}>
              <span className={styles.rowIcon} aria-hidden="true">
                <PillIcon />
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{supplement.name}</span>
                {supplement.dose && <span className={styles.rowMeta}>{supplement.dose}</span>}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Remove ${supplement.name}`}
                onClick={() =>
                  undo.schedule({
                    label: `Removed “${supplement.name}”`,
                    id: supplementUndoId(supplement.id),
                    commit: () => removeSupplement(supplement.id),
                  })
                }
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {removed && (
        // Its Undo waits while the pointer or focus is on it, as the page's does.
        <div
          role="status"
          className={styles.removed}
          onPointerEnter={undo.pause}
          onPointerLeave={undo.resume}
          onFocus={undo.pause}
          onBlur={undo.resume}
        >
          {removed.name} removed.
          <Button variant="quiet" onClick={undo.undo}>
            Undo
          </Button>
        </div>
      )}
      <form className={styles.addSupplement} onSubmit={add} noValidate>
        <label className={styles.field}>
          Name
          <input
            ref={nameField}
            value={name}
            placeholder="Creatine"
            maxLength={fitnessLimits.supplementName}
            autoComplete="off"
            disabled={full}
            data-autofocus
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Dose <span className={styles.optional}>(optional)</span>
          <input
            value={dose}
            placeholder="5 g"
            maxLength={fitnessLimits.dose}
            autoComplete="off"
            disabled={full}
            enterKeyHint="done"
            onChange={(e) => setDose(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={full}>
          <PlusIcon />
          Add
        </Button>
        {error && (
          <p id={`${id}-error`} className={styles.fieldError}>
            {error}
          </p>
        )}
        {full && <p className={ui.muted}>You can keep up to {fitnessLimits.supplements} supplements.</p>}
      </form>
    </Sheet>
  );
}

/** Daily goals (panel goals): the water and steps Today measures each day against. */
export function GoalsDialog() {
  const { data, updateGoals } = useFitness();
  const { closePanel } = useAppView();
  const [errors, setErrors] = useState<{ water?: string; steps?: string }>({});
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const goals = data?.goals;

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const water = parseCount(String(formData.get("water") ?? ""));
    const steps = parseCount(String(formData.get("steps") ?? ""));
    const found: typeof errors = {};
    if (water === null || water < fitnessLimits.waterGoalMin || water > fitnessLimits.waterGoalMax)
      found.water = `Enter from ${formatNumber(fitnessLimits.waterGoalMin)} to ${formatNumber(fitnessLimits.waterGoalMax)} ml.`;
    if (steps === null || steps < fitnessLimits.stepsGoalMin || steps > fitnessLimits.stepsGoalMax)
      found.steps = `Enter from ${formatNumber(fitnessLimits.stepsGoalMin)} to ${formatNumber(fitnessLimits.stepsGoalMax)} steps.`;
    setErrors(found);
    if (found.water || found.steps) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    if (water !== goals?.waterMl || steps !== goals?.steps) updateGoals({ waterMl: water!, steps: steps! });
    closePanel();
  }

  return (
    <Sheet title="Daily goals" onClose={closePanel}>
      {/* Keyed by the goals, so the fields start with them once they have loaded. */}
      <form key={goals ? "loaded" : "loading"} ref={form} className={styles.form} onSubmit={save} noValidate>
        {(errors.water || errors.steps) && <Alert>Check the fields marked below.</Alert>}
        <label className={styles.field}>
          Water
          <span className={styles.entryField}>
            <input
              name="water"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={goals?.waterMl}
              data-autofocus
              aria-label="Water in ml"
              aria-invalid={!!errors.water || undefined}
              aria-describedby={errors.water ? `${id}-water` : undefined}
            />
            <span className={styles.entryUnit} aria-hidden="true">
              ml
            </span>
          </span>
          {errors.water && (
            <p id={`${id}-water`} className={styles.fieldError}>
              {errors.water}
            </p>
          )}
        </label>
        <label className={styles.field}>
          Steps
          <input
            name="steps"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={goals?.steps}
            aria-invalid={!!errors.steps || undefined}
            aria-describedby={errors.steps ? `${id}-steps` : undefined}
          />
          {errors.steps && (
            <p id={`${id}-steps`} className={styles.fieldError}>
              {errors.steps}
            </p>
          )}
        </label>
        <div className={ui.actions}>
          <Button variant="primary" type="submit" disabled={!goals}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
