// People's names, for the server and the browser. Everyone has a username; a
// name too once they set one, as they want it: "Diogo" or "Diogo Mota"
// (014_one_name.sql).

export type Named = { username: string; name: string | null };

/** A person's name, or their username without one: "Diogo" or "diogofrmota". */
export const memberName = (person: Named): string => person.name ?? person.username;

/**
 * The letters of an avatar without a picture: the first letters of the first
 * and last words of the name ("Diogo Mota" → "DM", "Rita" → "R"), or of the
 * username without a name. Two people with the same first letter still differ
 * by their second, and a username is often not what people are called.
 */
export function initials(username: string, name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = (word: string) => Array.from(word)[0]?.toLocaleUpperCase("en") ?? "";
  if (words.length === 0) return first(username);
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words.at(-1)!);
}
