"use client";
import { ChevronRightIcon, DumbbellIcon, PlusIcon } from "@/components/common/icons";
import { useOpenAfterClose } from "@/components/common/OpenAfterClose";
import { Spinner } from "@/components/common/Spinner";
import { Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { datePlus } from "@/lib/calendar";
import { isDay, routineLine, shortDate, type Routine } from "@/lib/fitness-types";
import { useFitness, useStartWorkout } from "./fitness-data";
import { Sheet } from "./Sheet";
import styles from "./Fitness.module.css";

/**
 * Start a workout on a day (start:<date>; today, or an earlier day for one
 * done then): one of the routines, at the weights of the last time, or an
 * empty one. The workout opens in its place.
 */
export function StartWorkout({ date }: { date: string }) {
  const { data, today, hidden, loadError } = useFitness();
  const { closePanel, setView } = useAppView();
  const openAfterClose = useOpenAfterClose();
  const start = useStartWorkout();
  const day = isDay(date) && date <= today ? date : today;
  const routines = data?.routines.filter((routine) => !hidden.has(routine.id)) ?? [];

  function begin(routine?: Routine) {
    openAfterClose(`workout:${start(day, routine)}`);
    closePanel();
  }

  return (
    <Sheet title={day === today ? "Start a workout" : "Add a workout"} onClose={closePanel}>
      {day !== today && (
        <p className={styles.sheetLead}>For {day === datePlus(today, -1) ? "yesterday" : shortDate(day, today)}.</p>
      )}
      {!data ? (
        loadError ? (
          <p className={ui.muted}>{loadError}</p>
        ) : (
          <Spinner label="Loading your routines…" />
        )
      ) : (
        <>
          {routines.length > 0 && (
            <ul className={styles.rows} aria-label="Routines">
              {routines.map((routine) => (
                <li key={routine.id}>
                  <button type="button" className={styles.row} onClick={() => begin(routine)}>
                    <span className={styles.rowIcon} aria-hidden="true">
                      <DumbbellIcon />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{routine.name}</span>
                      <span className={styles.rowMeta}>{routineLine(routine)}</span>
                    </span>
                    <ChevronRightIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={ui.actions}>
            <Button variant={routines.length ? undefined : "primary"} onClick={() => begin()}>
              <PlusIcon />
              Empty workout
            </Button>
          </div>
          {routines.length === 0 && (
            <p className={styles.sheetNote}>
              Routines start with their exercises, sets and reps.{" "}
              <button
                type="button"
                className={styles.inlineLink}
                // Showing a view closes the panels.
                onClick={() => setView("workouts")}
              >
                Make one in Workouts
              </button>
              .
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
