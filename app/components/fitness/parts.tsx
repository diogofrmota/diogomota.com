"use client";
import { Alert } from "@/components/common/ui";
import { useFitness } from "./fitness-data";
import styles from "./Fitness.module.css";

/** The last refused change, with a button to dismiss it. */
export function ChangeError() {
  const { error, dismissError } = useFitness();
  if (!error) return null;
  return (
    <Alert className={styles.viewError} onDismiss={dismissError}>
      {error}
    </Alert>
  );
}

/** The load failed: why, with Retry (what was kept from before stays on screen). */
export function LoadError() {
  const { loadError, reload } = useFitness();
  return loadError ? <Alert onRetry={reload}>{loadError}</Alert> : null;
}

/** A card's heading: its icon, its title, and an action on the right (Edit, the goal). */
export function CardHeader({
  id,
  icon,
  title,
  action,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.cardHeader}>
      <span className={styles.cardIcon} aria-hidden="true">
        {icon}
      </span>
      <h3 id={id}>{title}</h3>
      {action}
    </div>
  );
}

/** How far along a goal: a bar, filled in the accent, and in green once it's met. Its numbers are in the text by it. */
export function GoalBar({ value, goal }: { value: number; goal: number }) {
  const share = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <span className={styles.bar} data-met={value >= goal || undefined} aria-hidden="true">
      <span className={styles.barFill} style={{ inlineSize: `${share * 100}%` }} />
    </span>
  );
}

/** Grey cards while the data loads for the first time. */
export function Skeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={styles.cards} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${styles.card} ${styles.skeletonCard}`}>
          <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
          <span className={`${styles.skeleton} ${styles.skeletonBlock}`} />
        </div>
      ))}
    </div>
  );
}
