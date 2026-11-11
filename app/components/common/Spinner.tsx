import styles from "./Spinner.module.css";

// A spinning ring and what is happening, such as "Loading tasks…", announced to
// screen readers as a status. For loads with no skeleton to show.
export function Spinner({ label }: { label: string }) {
  return (
    <p role="status" className={styles.spinner}>
      <span className={styles.ring} aria-hidden="true" />
      {label}
    </p>
  );
}

/**
 * A ring that turns, the size of the text around it: in place of an icon
 * while what it stands for loads.
 */
export function InlineSpinner() {
  return <span className={styles.inline} aria-hidden="true" />;
}

/**
 * Over a button's label while what it started runs: the label goes clear (it
 * stays the button's name, and keeps its width) and the ring turns in its
 * place (ui.module.css, `.button:has(> [data-pending])`). Fades in after a
 * moment, so a quick answer doesn't flash it.
 */
export function PendingOverlay({ pending }: { pending: boolean }) {
  return <span className={styles.overlay} data-pending={pending || undefined} aria-hidden="true" />;
}
