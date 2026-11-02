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
