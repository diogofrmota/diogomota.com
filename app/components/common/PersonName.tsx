import { fullName, type Named } from "@/lib/names";
import styles from "./PersonName.module.css";

/**
 * Someone's name with their username after it, quieter: "Diogo Mota
 * (@diogofrmota)", or with `first` only the first name, "Diogo (@diogofrmota)".
 * Without a name, "@diogofrmota". Inline, so it can be cut off with an
 * ellipsis by `className`.
 */
export function PersonName({ person, first = false, className }: { person: Named; first?: boolean; className?: string }) {
  const name = first ? person.firstName : fullName(person);
  return <span className={className}>
    {name ? <>{name} <span className={styles.handle}>(@{person.username})</span></> : `@${person.username}`}
  </span>;
}
