// People's names, for the server and the browser. Everyone has a username; a
// first name and a last name too once they set them (013_names.sql).

export type Named = { username: string; firstName: string | null; lastName: string | null };

/** "Diogo Mota", "Diogo" without a last name, or null without a name. */
export const fullName = (person: Named): string | null =>
  [person.firstName, person.lastName].filter(Boolean).join(" ") || null;

/**
 * How someone is shown, in words: "Diogo Mota (@diogofrmota)" (with `first`,
 * "Diogo (@diogofrmota)"), or "@diogofrmota" without a name.
 */
export function personLabel(person: Named, first = false): string {
  const name = first ? person.firstName : fullName(person);
  return name ? `${name} (@${person.username})` : `@${person.username}`;
}
