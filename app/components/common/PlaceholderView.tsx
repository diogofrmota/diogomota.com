import styles from "./PlaceholderView.module.css";

// Stand-in for an app view that isn't built yet.
export function PlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <section className={styles.view}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
      <p className={styles.soon}>Coming soon.</p>
    </section>
  );
}
