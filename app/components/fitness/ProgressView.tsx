"use client";
import { useId, useState } from "react";
import { ChevronDownIcon, DropIcon, DumbbellIcon, ScaleIcon, StepsIcon, TrophyIcon } from "@/components/common/icons";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { datePlus } from "@/lib/calendar";
import {
  average,
  exerciseProgress,
  foldName,
  formatKg,
  formatKm,
  formatMl,
  formatNumber,
  formatPace,
  lastDays,
  liftRecords,
  paceOf,
  runRecords,
  shortDate,
  weekStats,
  weightSeries,
  type FitnessData,
  type LiftRecord,
} from "@/lib/fitness-types";
import { BarChart, LineChart } from "./Charts";
import { useFitness } from "./fitness-data";
import { CardHeader, ChangeError, LoadError, Skeleton } from "./parts";
import styles from "./Fitness.module.css";

/** The last 7 days, in four numbers: workouts, distance run, steps a day and water a day. */
function Week({ data }: { data: FitnessData }) {
  const { today } = useFitness();
  const id = useId();
  const week = weekStats(data, today);
  const tiles = [
    { label: "Workouts", value: formatNumber(week.workouts) },
    { label: "Distance run", value: formatKm(week.distanceM) },
    { label: "Steps a day", value: week.steps === null ? "–" : formatNumber(Math.round(week.steps)) },
    { label: "Water a day", value: week.waterMl === null ? "–" : formatMl(Math.round(week.waterMl / 10) * 10) },
  ];
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        Last 7 days
      </h2>
      <dl className={styles.stats}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.stat}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const shownRecords = 6;

/** A lift's records: the heaviest set, the best estimated one-rep max, or the most reps for one done without weight. */
function LiftRow({ record, today }: { record: LiftRecord; today: string }) {
  const { openPanel } = useAppView();
  const best = record.heaviest ?? record.mostReps!;
  return (
    <li>
      <button type="button" className={styles.record} onClick={() => openPanel(`workout:${best.workoutId}`)}>
        <span className={styles.recordName}>{record.name}</span>
        <span className={styles.recordValue}>
          {record.heaviest
            ? `${formatKg(record.heaviest.weightKg!)} × ${record.heaviest.reps}`
            : `${record.mostReps!.reps} reps`}
        </span>
        <span className={styles.recordMeta}>
          {shortDate(best.date, today)}
          {record.oneRepMax && ` · 1-rep max about ${formatKg(record.oneRepMax.kg)}`}
          {` · ${record.sessions === 1 ? "once" : `${formatNumber(record.sessions)} times`}`}
        </span>
      </button>
    </li>
  );
}

/** Personal records: each lift's best, then the longest run and the fastest pace. */
function Records({ data }: { data: FitnessData }) {
  const { today } = useFitness();
  const { openPanel } = useAppView();
  const id = useId();
  const [all, setAll] = useState(false);
  const lifts = liftRecords(data.workouts);
  const runs = runRecords(data.runs);
  const shown = all ? lifts : lifts.slice(0, shownRecords);
  return (
    <section className={`${styles.card} ${styles.wideCard}`} aria-labelledby={id}>
      <CardHeader id={id} icon={<TrophyIcon />} title="Personal records" />
      {!lifts.length && !runs.longest ? (
        <p className={styles.empty}>
          Your records show here once you&rsquo;ve ticked off the sets of a workout, or logged a run.
        </p>
      ) : (
        <>
          {lifts.length > 0 && (
            <ul className={styles.records} aria-label="Lifts">
              {shown.map((record) => (
                <LiftRow key={foldName(record.name)} record={record} today={today} />
              ))}
            </ul>
          )}
          {lifts.length > shownRecords && (
            <div>
              <Button variant="quiet" onClick={() => setAll((on) => !on)}>
                {all ? "Show fewer" : `Show all ${lifts.length}`}
              </Button>
            </div>
          )}
          {runs.longest && (
            <ul className={styles.records} aria-label="Runs">
              <li>
                <button type="button" className={styles.record} onClick={() => openPanel(`run:${runs.longest!.id}`)}>
                  <span className={styles.recordName}>Longest run</span>
                  <span className={styles.recordValue}>{formatKm(runs.longest.distanceM)}</span>
                  <span className={styles.recordMeta}>{shortDate(runs.longest.date, today)}</span>
                </button>
              </li>
              {runs.fastest && (
                <li>
                  <button type="button" className={styles.record} onClick={() => openPanel(`run:${runs.fastest!.id}`)}>
                    <span className={styles.recordName}>Fastest pace</span>
                    <span className={styles.recordValue}>{formatPace(paceOf(runs.fastest))}</span>
                    <span className={styles.recordMeta}>
                      {shortDate(runs.fastest.date, today)} · {formatKm(runs.fastest.distanceM)}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Strength: an exercise (the one done most often to start with), its heaviest set each day it was done. */
function Strength({ data }: { data: FitnessData }) {
  const id = useId();
  const lifts = liftRecords(data.workouts).filter((record) => record.heaviest);
  const [picked, setPicked] = useState<string | null>(null);
  const often = [...lifts].sort((a, b) => b.sessions - a.sessions)[0];
  const exercise = lifts.find((record) => foldName(record.name) === picked) ?? often;
  const points = exercise ? exerciseProgress(data.workouts, exercise.name) : [];
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader id={id} icon={<DumbbellIcon />} title="Strength" />
      {!exercise ? (
        <p className={styles.empty}>Tick off sets with a weight, and each exercise&rsquo;s heaviest set shows here.</p>
      ) : (
        <>
          <label className={styles.select}>
            <span className={ui.srOnly}>Exercise</span>
            <select value={foldName(exercise.name)} onChange={(e) => setPicked(e.target.value)}>
              {[...lifts]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((record) => (
                  <option key={foldName(record.name)} value={foldName(record.name)}>
                    {record.name}
                  </option>
                ))}
            </select>
            <ChevronDownIcon />
          </label>
          <p className={styles.cardNote}>Heaviest set each day, in kg</p>
          <LineChart
            key={foldName(exercise.name)}
            points={points.map((point) => ({ date: point.date, value: point.weightKg }))}
            label={`${exercise.name}, heaviest set each day, in kg`}
            header="Heaviest set"
            format={formatKg}
          />
        </>
      )}
    </section>
  );
}

const ranges = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "365", label: "Year", days: 365 },
  { id: "all", label: "All", days: null },
] as const;

/** Body weight over 30 days, 90, a year or all of it, and the change over that time. */
function Weight({ data }: { data: FitnessData }) {
  const { today } = useFitness();
  const id = useId();
  const [range, setRange] = useState<(typeof ranges)[number]["id"]>("90");
  const days = ranges.find((r) => r.id === range)!.days;
  const points = weightSeries(data.days, days === null ? undefined : datePlus(today, -(days - 1)));
  const change = points.length > 1 ? Math.round((points.at(-1)!.value - points[0].value) * 10) / 10 : null;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader id={id} icon={<ScaleIcon />} title="Body weight" />
      {weightSeries(data.days).length === 0 ? (
        <p className={styles.empty}>Log your weight on Today, and how it changes shows here.</p>
      ) : (
        <>
          <div className={styles.chips} role="group" aria-label="Over">
            {ranges.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          {points.length ? (
            <>
              <p className={styles.cardNote}>
                {formatKg(points.at(-1)!.value)} on {shortDate(points.at(-1)!.date, today)}
                {change !== null &&
                  (change === 0
                    ? `, the same as on ${shortDate(points[0].date, today)}`
                    : `, ${change > 0 ? "+" : "−"}${formatKg(Math.abs(change))} since ${shortDate(points[0].date, today)}`)}
              </p>
              <LineChart
                key={range}
                points={points}
                label="Body weight, in kg"
                header="Body weight"
                format={formatKg}
              />
            </>
          ) : (
            <p className={styles.empty}>No weigh-ins in this time. Choose a longer one.</p>
          )}
        </>
      )}
    </section>
  );
}

/** Steps or water, the last 14 days, against the daily goal, with the average of the days logged. */
function Daily({ data, kind }: { data: FitnessData; kind: "steps" | "water" }) {
  const { today } = useFitness();
  const id = useId();
  const steps = kind === "steps";
  const bars = lastDays(data.days, today, 14, (day) => (steps ? day.steps : day.waterMl || null));
  const mean = average(bars.map((bar) => bar.value));
  const format = steps ? formatNumber : formatMl;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <CardHeader id={id} icon={steps ? <StepsIcon /> : <DropIcon />} title={steps ? "Steps" : "Water"} />
      <p className={styles.cardNote}>
        {mean === null
          ? "Nothing logged in the last 14 days."
          : `Last 14 days: ${format(steps ? Math.round(mean) : Math.round(mean / 10) * 10)} a day on average`}
      </p>
      <BarChart
        bars={bars}
        goal={steps ? data.goals.steps : data.goals.waterMl}
        label={steps ? "Steps each day, the last 14 days" : "Water each day, the last 14 days, in ml"}
        header={steps ? "Steps" : "Water"}
        format={format}
        today={today}
      />
    </section>
  );
}

/** Progress: the last 7 days, personal records, and charts of strength, body weight, steps and water. */
export function ProgressView() {
  const { data, loadError } = useFitness();
  const nothing = data && !data.workouts.length && !data.runs.length && !data.days.length;
  return (
    <div className={styles.view}>
      {/* The tab shows which view this is. */}
      <h1 className={ui.srOnly}>Progress</h1>
      <ChangeError />
      <LoadError />
      {!data ? (
        !loadError && <Skeleton count={4} />
      ) : nothing ? (
        <div className={styles.welcome}>
          <h2>Your progress, over time</h2>
          <p>
            Log workouts, runs, steps, water and your weight, and this is where you see them add up: your personal
            records, how much you lift, and how your weeks compare.
          </p>
        </div>
      ) : (
        <>
          <Week data={data} />
          <div className={styles.cards}>
            <Records data={data} />
            <Strength data={data} />
            <Weight data={data} />
            <Daily data={data} kind="steps" />
            <Daily data={data} kind="water" />
          </div>
        </>
      )}
    </div>
  );
}
