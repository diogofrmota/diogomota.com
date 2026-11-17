"use client";
import { useId, useState, type FormEvent } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DropIcon,
  DumbbellIcon,
  MinusIcon,
  PillIcon,
  PlusIcon,
  ScaleIcon,
  ShoeIcon,
  StepsIcon,
} from "@/components/common/icons";
import { successPulse } from "@/components/common/motion";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { datePlus } from "@/lib/calendar";
import {
  dayName,
  dayOf,
  fitnessLimits,
  formatKg,
  formatMl,
  formatNumber,
  longDate,
  parseCount,
  parseDecimal,
  previousWeight,
  roundTo,
  runLine,
  shortDate,
  waterAmounts,
  workoutLine,
  type FitnessData,
} from "@/lib/fitness-types";
import { supplementUndoId, useFitness } from "./fitness-data";
import { CardHeader, ChangeError, GoalBar, LoadError, Skeleton } from "./parts";
import styles from "./Fitness.module.css";

/** The day shown, with ‹ and › to the one before and after (not past today), and Back to today. */
function DayBar({ day, today, onChange }: { day: string; today: string; onChange: (day: string | null) => void }) {
  return (
    <div className={styles.dayBar}>
      <button
        type="button"
        className={styles.dayStep}
        aria-label="Previous day"
        onClick={() => onChange(datePlus(day, -1))}
      >
        <ChevronLeftIcon />
      </button>
      <div className={styles.dayLabel} aria-live="polite">
        <h2>{dayName(day, today)}</h2>
        <p>{longDate(day)}</p>
      </div>
      <button
        type="button"
        className={styles.dayStep}
        aria-label="Next day"
        disabled={day >= today}
        onClick={() => onChange(datePlus(day, 1) >= today ? null : datePlus(day, 1))}
      >
        <ChevronRightIcon />
      </button>
      {day !== today && (
        <Button variant="quiet" className={styles.backToToday} onClick={() => onChange(null)}>
          Back to today
        </Button>
      )}
    </div>
  );
}

/** The day's workouts and runs, each opening its panel; Start workout (Add workout on another day) and Log a run. */
function Training({ day, data }: { day: string; data: FitnessData }) {
  const { hidden, today } = useFitness();
  const { openPanel } = useAppView();
  const id = useId();
  const workouts = data.workouts.filter((workout) => workout.date === day && !hidden.has(workout.id));
  const runs = data.runs.filter((run) => run.date === day && !hidden.has(run.id));
  return (
    <section className={`${styles.card} ${styles.wideCard}`} aria-labelledby={id}>
      <CardHeader id={id} icon={<DumbbellIcon />} title="Training" />
      {workouts.length || runs.length ? (
        <ul className={styles.rows}>
          {workouts.map((workout) => (
            <li key={workout.id}>
              <button type="button" className={styles.row} onClick={() => openPanel(`workout:${workout.id}`)}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <DumbbellIcon />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{workout.name}</span>
                  <span className={styles.rowMeta}>{workoutLine(workout)}</span>
                </span>
                <ChevronRightIcon />
              </button>
            </li>
          ))}
          {runs.map((run) => (
            <li key={run.id}>
              <button type="button" className={styles.row} onClick={() => openPanel(`run:${run.id}`)}>
                <span className={styles.rowIcon} aria-hidden="true">
                  <ShoeIcon />
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>Run</span>
                  <span className={styles.rowMeta}>{runLine(run)}</span>
                </span>
                <ChevronRightIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {day === today ? "No workout or run yet today." : "No workout or run on this day."}
        </p>
      )}
      <div className={styles.cardActions}>
        <Button variant="primary" onClick={() => openPanel(`start:${day}`)}>
          <DumbbellIcon />
          {day === today ? "Start workout" : "Add workout"}
        </Button>
        <Button onClick={() => openPanel(`new-run:${day}`)}>
          <ShoeIcon />
          Log a run
        </Button>
      </div>
    </section>
  );
}

/** The goal, a tap away from the card it is for. */
function GoalButton({ children }: { children: React.ReactNode }) {
  const { openPanel } = useAppView();
  return (
    <Button variant="quiet" className={styles.cardAction} onClick={() => openPanel("goals")}>
      {children}
    </Button>
  );
}

/** Water: the day's, against the goal, with a glass or a bottle more (or less) a tap away. */
function Water({ day, data }: { day: string; data: FitnessData }) {
  const { updateDay } = useFitness();
  const id = useId();
  const water = dayOf(data.days, day).waterMl;
  const goal = data.goals.waterMl;
  const [glass] = waterAmounts;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader id={id} icon={<DropIcon />} title="Water" action={<GoalButton>Goal {formatMl(goal)}</GoalButton>} />
      <p className={styles.amount}>
        <data className={styles.big} value={water}>
          {formatNumber(water)}
        </data>{" "}
        <span className={styles.of}>of {formatMl(goal)}</span>
      </p>
      <GoalBar value={water} goal={goal} />
      <div className={styles.buttonRow}>
        <Button
          aria-label={`${glass} ml less`}
          disabled={water <= 0}
          onClick={() => updateDay(day, (d) => ({ waterMl: Math.max(0, d.waterMl - glass) }))}
        >
          <MinusIcon />
        </Button>
        {waterAmounts.map((ml) => (
          <Button
            key={ml}
            disabled={water + ml > fitnessLimits.waterMl}
            onClick={(event) => {
              if (water < goal && water + ml >= goal) successPulse(event.currentTarget);
              updateDay(day, (d) => ({ waterMl: Math.min(fitnessLimits.waterMl, d.waterMl + ml) }));
            }}
          >
            <PlusIcon />
            {formatMl(ml)}
          </Button>
        ))}
      </div>
    </section>
  );
}

/**
 * A number typed for the day (steps, body weight), saved with Save: the field
 * starts with what is logged, and emptied, Save clears it. Keyed by the day and
 * the value, so it starts again when either changes.
 */
function Entry({
  label,
  unit,
  value,
  placeholder,
  inputMode,
  read,
  invalid,
  onSave,
}: {
  label: string;
  unit?: string;
  value: string;
  placeholder: string;
  inputMode: "numeric" | "decimal";
  /** The number typed, or null when it isn't one the field takes. */
  read: (text: string) => number | null;
  invalid: string;
  onSave: (value: number | null) => void;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState("");
  const id = useId();
  function save(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("");
      onSave(null);
      return;
    }
    const number = read(text);
    if (number === null) {
      setError(invalid);
      return;
    }
    setError("");
    onSave(number);
  }
  return (
    <form className={styles.entry} onSubmit={save} noValidate>
      <span className={styles.entryField}>
        <input
          id={id}
          aria-label={label}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          value={text}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
        />
        {unit && (
          <span className={styles.entryUnit} aria-hidden="true">
            {unit}
          </span>
        )}
      </span>
      <Button type="submit" disabled={text.trim() === value}>
        Save
      </Button>
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </form>
  );
}

/** Steps: the day's, against the goal, typed in (from the phone's own count). */
function Steps({ day, data }: { day: string; data: FitnessData }) {
  const { updateDay } = useFitness();
  const id = useId();
  const steps = dayOf(data.days, day).steps;
  const goal = data.goals.steps;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader
        id={id}
        icon={<StepsIcon />}
        title="Steps"
        action={<GoalButton>Goal {formatNumber(goal)}</GoalButton>}
      />
      <p className={styles.amount}>
        <data className={styles.big} value={steps ?? 0}>
          {steps === null ? "–" : formatNumber(steps)}
        </data>{" "}
        <span className={styles.of}>of {formatNumber(goal)}</span>
      </p>
      <GoalBar value={steps ?? 0} goal={goal} />
      <Entry
        key={`${day}:${steps}`}
        label="Steps"
        value={steps === null ? "" : String(steps)}
        placeholder="Steps walked"
        inputMode="numeric"
        read={(text) => {
          const count = parseCount(text);
          return count !== null && count <= fitnessLimits.steps ? count : null;
        }}
        invalid={`Enter the steps as a whole number, up to ${formatNumber(fitnessLimits.steps)}.`}
        onSave={(value) => updateDay(day, () => ({ steps: value }))}
      />
    </section>
  );
}

/** Body weight: the day's, and the change since the last weigh-in; typed in kg. */
function BodyWeight({ day, data }: { day: string; data: FitnessData }) {
  const { updateDay, today } = useFitness();
  const id = useId();
  const weight = dayOf(data.days, day).weightKg;
  const previous = previousWeight(data.days, day);
  const change = weight !== null && previous ? Math.round((weight - previous.weightKg) * 10) / 10 : null;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader id={id} icon={<ScaleIcon />} title="Body weight" />
      <p className={styles.amount}>
        <data className={styles.big} value={weight ?? ""}>
          {weight === null ? "–" : formatNumber(weight)}
        </data>{" "}
        <span className={styles.of}>kg</span>
      </p>
      <p className={styles.cardNote}>
        {weight === null
          ? previous
            ? `Last: ${formatKg(previous.weightKg)} on ${shortDate(previous.date, today)}`
            : "Weigh yourself at the same time each day, for a steady line."
          : change === null
            ? "Your first weigh-in."
            : change === 0
              ? `The same as on ${shortDate(previous!.date, today)}`
              : `${change > 0 ? "+" : "−"}${formatKg(Math.abs(change))} since ${shortDate(previous!.date, today)}`}
      </p>
      <Entry
        key={`${day}:${weight}`}
        label="Body weight in kg"
        unit="kg"
        value={weight === null ? "" : String(weight)}
        placeholder={previous ? String(previous.weightKg) : "Your weight"}
        inputMode="decimal"
        read={(text) => {
          const kg = parseDecimal(text);
          return kg !== null && kg >= fitnessLimits.bodyWeightMin && kg <= fitnessLimits.bodyWeightMax
            ? roundTo(kg, 0.1)
            : null;
        }}
        invalid={`Enter a weight from ${fitnessLimits.bodyWeightMin} to ${fitnessLimits.bodyWeightMax} kg, like 78.4.`}
        onSave={(value) => updateDay(day, () => ({ weightKg: value === null ? null : Math.round(value * 10) / 10 }))}
      />
    </section>
  );
}

/** The supplements, ticked off for the day; Edit (or Add supplements) opens the list of them. */
function Supplements({ day, data }: { day: string; data: FitnessData }) {
  const { updateDay, hidden } = useFitness();
  const { openPanel } = useAppView();
  const id = useId();
  const supplements = data.supplements.filter((s) => !hidden.has(supplementUndoId(s.id)));
  const known = new Set(data.supplements.map((s) => s.id));
  const taken = new Set(dayOf(data.days, day).taken.filter((t) => known.has(t)));
  const count = supplements.filter((s) => taken.has(s.id)).length;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader
        id={id}
        icon={<PillIcon />}
        title="Supplements"
        action={
          supplements.length > 0 && (
            <Button
              variant="quiet"
              className={styles.cardAction}
              aria-label="Edit supplements"
              onClick={() => openPanel("supplements")}
            >
              Edit
            </Button>
          )
        }
      />
      {supplements.length ? (
        <>
          <ul className={styles.checklist}>
            {supplements.map((supplement) => (
              <li key={supplement.id}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={taken.has(supplement.id)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      updateDay(day, (d) => ({
                        taken: [
                          ...d.taken.filter((t) => t !== supplement.id && known.has(t)),
                          ...(on ? [supplement.id] : []),
                        ],
                      }));
                    }}
                  />
                  <span className={styles.checkText}>
                    {supplement.name}
                    {supplement.dose && <span className={styles.dose}> · {supplement.dose}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className={styles.cardNote} aria-live="polite">
            {count === supplements.length ? "All taken." : `${count} of ${supplements.length} taken`}
          </p>
        </>
      ) : (
        <>
          <p className={styles.empty}>Add what you take each day, like creatine or vitamin D, to tick it off here.</p>
          <div className={styles.cardActions}>
            <Button onClick={() => openPanel("supplements")}>
              <PlusIcon />
              Add supplements
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Today: a day of the log (today to start with, or one before it), with its
 * workouts and runs, water, steps, body weight and supplements.
 */
export function TodayView() {
  const { data, today, loadError } = useFitness();
  const [picked, setPicked] = useState<string | null>(null);
  // Never past today (a page left open overnight moves on with it).
  const day = picked && picked < today ? picked : today;
  return (
    <div className={styles.view}>
      {/* The tab shows which view this is. */}
      <h1 className={ui.srOnly}>Today</h1>
      <ChangeError />
      <LoadError />
      <DayBar day={day} today={today} onChange={setPicked} />
      {!data ? (
        !loadError && <Skeleton count={5} />
      ) : (
        <div className={styles.cards}>
          <Training day={day} data={data} />
          <Water day={day} data={data} />
          <Steps day={day} data={data} />
          <BodyWeight day={day} data={data} />
          <Supplements day={day} data={data} />
        </div>
      )}
    </div>
  );
}
