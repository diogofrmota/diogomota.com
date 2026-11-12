import type { Named } from "@/lib/names";
import styles from "./PersonName.module.css";

/**
 * Someone's name with their username after it, quieter: "Diogo Mota
 * (@diogofrmota)". Without a name, "@diogofrmota". Inline, so it can be cut
 * off with an ellipsis by `className`.
 */
export function PersonName({ person, className }: { person: Named; className?: string }) {
  return <span className={className}>
    {person.name ? <>{person.name} <span className={styles.handle}>(@{person.username})</span></> : `@${person.username}`}
  </span>;
}
