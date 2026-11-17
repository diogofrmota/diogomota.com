"use client";
import { useId, useState } from "react";
import { ChevronRightIcon, DumbbellIcon, PencilIcon, PlayIcon, PlusIcon, ShoeIcon } from "@/components/common/icons";
import { stagger, useSettled } from "@/components/common/motion";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { dateLabel } from "@/lib/calendar";
import { countOf, historyOf, runLine, workoutLine, type HistoryItem, type Routine } from "@/lib/fitness-types";
import { useFitness, useStartWorkout } from "./fitness-data";
import { ChangeError, LoadError, Skeleton } from "./parts";
import styles from "./Fitness.module.css";

/** A routine's card: its name, its exercises with their sets and reps, Start (today) and Edit. */
function RoutineCard({ routine, index, settled }: { routine: Routine; index: number; settled: boolean }) {
  const { openPanel } = useAppView();
  const { today } = useFitness();
  const start = useStartWorkout();
  const id = useId();
  return (
    <li className={styles.routineCard} style={stagger(index, settled)} aria-labelledby={id}>
      <div className={styles.routineTop}>
        <h3 id={id}>{routine.name}</h3>
        <p className={styles.rowMeta}>{countOf(routine.exercises.length, "exercise")}</p>
      </div>
      <ul className={styles.routineExercises}>
        {routine.exercises.map((exercise, i) => (
          <li key={i}>
            <span className={styles.routineExercise}>{exercise.name}</span>
            <span className={styles.target}>
              {exercise.sets} × {exercise.reps}
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.cardActions}>
        <Button
          variant="primary"
          aria-label={`Start ${routine.name}`}
          onClick={() => openPanel(`workout:${start(today, routine)}`)}
        >
          <PlayIcon />
          Start
        </Button>
        <Button aria-label={`Edit ${routine.name}`} onClick={() => openPanel(`routine:${routine.id}`)}>
          <PencilIcon />
          Edit
        </Button>
      </div>
    </li>
  );
}

const filters = [
  { id: "all", label: "All" },
  { id: "workouts", label: "Workouts" },
  { id: "runs", label: "Runs" },
] as const;
type Filter = (typeof filters)[number]["id"];

const pageSize = 20;

/** "November 2026": the heading of a month of the history. */
const monthOf = (date: string) => dateLabel(date, { month: "long", year: "numeric" });

/** A workout or a run of the history: its day, what it was, and its numbers; it opens its panel. */
function HistoryRow({ entry }: { entry: HistoryItem }) {
  const { openPanel } = useAppView();
  const { item } = entry;
  const workout = entry.kind === "workout";
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        onClick={() => openPanel(workout ? `workout:${item.id}` : `run:${item.id}`)}
      >
        <time className={styles.dateBadge} dateTime={item.date}>
          <span>{dateLabel(item.date, { weekday: "short" })}</span>
          <strong>{Number(item.date.slice(8))}</strong>
        </time>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>
            <span className={styles.rowKind} aria-hidden="true">
              {workout ? <DumbbellIcon /> : <ShoeIcon />}
            </span>
            {workout ? entry.item.name : "Run"}
          </span>
          <span className={styles.rowMeta}>{workout ? workoutLine(entry.item) : runLine(entry.item)}</span>
        </span>
        <ChevronRightIcon />
      </button>
    </li>
  );
}

/** Every workout and run, newest first, by month; All, Workouts or Runs; 20 at a time. */
function History() {
  const { data, hidden } = useFitness();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(pageSize);
  const id = useId();
  const items = historyOf(
    filter === "runs" ? [] : (data?.workouts ?? []).filter((w) => !hidden.has(w.id)),
    filter === "workouts" ? [] : (data?.runs ?? []).filter((r) => !hidden.has(r.id)),
  );
  const shown = items.slice(0, limit);
  const months: { label: string; items: HistoryItem[] }[] = [];
  for (const item of shown) {
    const label = monthOf(item.item.date);
    if (months.at(-1)?.label === label) months.at(-1)!.items.push(item);
    else months.push({ label, items: [item] });
  }
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <h2 id={id}>History</h2>
      </div>
      <div className={styles.chips} role="group" aria-label="Show">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setLimit(pageSize);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {months.length ? (
        months.map((month) => (
          <div key={month.label} className={styles.month}>
            <h3>{month.label}</h3>
            <ul className={styles.rows} aria-label={month.label}>
              {month.items.map((entry) => (
                <HistoryRow key={entry.item.id} entry={entry} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className={styles.empty}>
          {filter === "runs"
            ? "No runs yet. Log one from Today."
            : filter === "workouts"
              ? "No workouts yet. Start one from a routine, or from Today."
              : "Your workouts and runs will be listed here."}
        </p>
      )}
      {items.length > limit && (
        <Button className={styles.showMore} onClick={() => setLimit((n) => n + pageSize)}>
          Show more
        </Button>
      )}
    </section>
  );
}

/** Workouts: the routines (New routine; each with Start and Edit), then the history of workouts and runs. */
export function WorkoutsView() {
  const { data, loadError, hidden } = useFitness();
  const { openPanel } = useAppView();
  const id = useId();
  const routines = data?.routines.filter((routine) => !hidden.has(routine.id)) ?? null;
  const settled = useSettled(!!routines);
  return (
    <div className={styles.view}>
      {/* The tab shows which view this is. */}
      <h1 className={ui.srOnly}>Workouts</h1>
      <ChangeError />
      <LoadError />
      {!routines ? (
        !loadError && <Skeleton count={3} />
      ) : (
        <>
          <section className={styles.section} aria-labelledby={id}>
            <div className={styles.sectionHeader}>
              <h2 id={id}>Routines</h2>
              {routines.length > 0 && (
                <Button variant="primary" onClick={() => openPanel("new-routine")}>
                  <PlusIcon />
                  New routine
                </Button>
              )}
            </div>
            {routines.length ? (
              <ul className={styles.routineGrid}>
                {routines.map((routine, i) => (
                  <RoutineCard key={routine.id} routine={routine} index={i} settled={settled} />
                ))}
              </ul>
            ) : (
              <div className={styles.welcome}>
                <h3>Plan your workouts</h3>
                <p>
                  Make a routine for each kind of day at the gym, like Push, Pull or Legs, with its exercises, sets and
                  reps. Start it at the gym to log each set as you lift.
                </p>
                <Button variant="primary" onClick={() => openPanel("new-routine")}>
                  <PlusIcon />
                  Create your first routine
                </Button>
              </div>
            )}
          </section>
          <History />
        </>
      )}
    </div>
  );
}
