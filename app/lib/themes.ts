/**
 * The themes a user can pick, in /account, in the order they are
 * listed there. Each one's colors are in components/common/themes.module.css,
 * under its id, and the database accepts only these ids (db/migrations): a new
 * theme goes in all three. `background` is the theme's --bg, for the browser's
 * own UI on mobile (<meta name="theme-color">). `recommended` ones get a star
 * in the picker.
 *
 * The light ones, then the dark ones; in each, the plain one, the gray one,
 * then the tinted ones. The ids are older than the names, and stay: they're
 * what accounts have saved.
 */
export const themes = [
  { id: "light-2", name: "Light mode", background: "#f1f5f9", recommended: true },
  { id: "minimal-neutrals", name: "Neutral", background: "#e6e6e6", recommended: true },
  { id: "warm-neutrals", name: "Warm", background: "#fff3db", recommended: false },
  { id: "earth-tones", name: "Earth tones", background: "#f8f3ec", recommended: false },
  { id: "dark-2", name: "Dark mode", background: "#000000", recommended: false },
  { id: "graphite", name: "Graphite", background: "#1f2023", recommended: true },
  { id: "dark-1", name: "Ocean", background: "#0b1120", recommended: false },
  { id: "blueprint", name: "Blueprint", background: "#123a6b", recommended: false },
] as const;

export type Theme = (typeof themes)[number]["id"];

/** Logged out, and new accounts' (the database's default): black, like the site's own pages. */
export const defaultTheme: Theme = "dark-2";

const ids: ReadonlySet<string> = new Set(themes.map((theme) => theme.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && ids.has(value);
}

export function themeBackground(theme: Theme): string {
  return themes.find((info) => info.id === theme)?.background ?? themeBackground(defaultTheme);
}
