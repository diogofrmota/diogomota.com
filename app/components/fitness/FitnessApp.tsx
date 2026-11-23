"use client";
import { useMemo } from "react";
import { AppShell } from "@/components/common/AppShell";
import { ChartIcon, DumbbellIcon, PulseIcon } from "@/components/common/icons";
import { OpenAfterCloseProvider, useOpenQueuedPanel } from "@/components/common/OpenAfterClose";
import { QueryProvider } from "@/components/common/QueryProvider";
import { UndoToast } from "@/components/common/Undo";
import { useAppView } from "@/hooks/useAppView";
import type { AppViewState } from "@/lib/app-views";
import type { Theme } from "@/lib/themes";
import { GoalsDialog, SupplementsDialog } from "./DailyDialogs";
import { FitnessProvider, setupFitness, useFitness } from "./fitness-data";
import { ProgressView } from "./ProgressView";
import { RoutineForm } from "./RoutineForm";
import { RunForm } from "./RunForm";
import { StartWorkout } from "./StartWorkout";
import { TodayView } from "./TodayView";
import { WorkoutDialog } from "./WorkoutDialog";
import { WorkoutsView } from "./WorkoutsView";

// The panels, in the URL (hooks/useAppView.ts), bottom to top:
//   start:<date>     Start a workout on that day (a routine, or an empty one)
//   workout:<id>     a workout, its exercises and sets
//   new-routine      a new routine's form; routine:<id> one's
//   new-run:<date>   Log a run on that day; run:<id> a run's
//   supplements      the supplements taken each day
//   goals            the daily goals for water and steps
// A workout started from Start a workout opens once that has closed (useOpenAfterClose).

function Panel({ panel }: { panel: string }) {
  const colon = panel.indexOf(":");
  const [kind, value] = colon < 0 ? [panel, ""] : [panel.slice(0, colon), panel.slice(colon + 1)];
  switch (kind) {
    case "start":
      return <StartWorkout date={value} />;
    case "workout":
      return <WorkoutDialog id={value} />;
    case "new-routine":
      return <RoutineForm />;
    case "routine":
      return <RoutineForm id={value} />;
    case "new-run":
      return <RunForm date={value} />;
    case "run":
      return <RunForm id={value} />;
    case "supplements":
      return <SupplementsDialog />;
    case "goals":
      return <GoalsDialog />;
    default:
      return null;
  }
}

function Panels() {
  const { panels } = useAppView();
  const { undo } = useFitness();
  useOpenQueuedPanel();
  // An exercise's or a supplement's Undo is in its dialog while that is open (the page's can't be reached behind it).
  const pendingId = undo.pending?.id ?? "";
  const undoInDialog =
    (pendingId.startsWith("exercise:") && panels.some((panel) => panel.startsWith("workout:"))) ||
    (pendingId.startsWith("supplement:") && panels.includes("supplements"));
  return (
    <>
      {panels.map((panel) => (
        <Panel key={panel} panel={panel} />
      ))}
      {!undoInDialog && <UndoToast undo={undo} />}
    </>
  );
}

// Today, Workouts and Progress, as tabs. The view and its open panels are in
// the URL: /fitness/workouts?p=workout:<id>.
export function FitnessApp({
  user,
  theme,
  initial,
  version,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
  theme: Theme;
  initial: AppViewState;
  version: string;
}) {
  const tabs = useMemo(
    () => [
      { id: "today", label: "Today", icon: <PulseIcon />, view: <TodayView /> },
      { id: "workouts", label: "Workouts", icon: <DumbbellIcon />, view: <WorkoutsView /> },
      { id: "progress", label: "Progress", icon: <ChartIcon />, view: <ProgressView /> },
    ],
    [],
  );
  return (
    <QueryProvider app="fitness" userId={user.id} version={version} setup={setupFitness}>
      <FitnessProvider>
        <OpenAfterCloseProvider>
          <AppShell
            name="Fitness"
            basePath="/fitness"
            initial={initial}
            username={user.username}
            avatarUrl={user.avatarUrl}
            theme={theme}
            tabs={tabs}
          >
            <Panels />
          </AppShell>
        </OpenAfterCloseProvider>
      </FitnessProvider>
    </QueryProvider>
  );
}
