/**
 * The themes a user can pick, in /account, in the order they are
 * listed there. Each one's colors are in components/common/themes.module.css,
 * under its id, and the database accepts only these ids (db/migrations): a new
 * theme goes in all three. `background` is the theme's --bg, for the browser's
 * own UI on mobile (<meta name="theme-color">).
 *
 * The light ones, then the dark ones; in each, the plain one, the gray one,
 * then the tinted ones. The ids are older than the names, and stay: they're
 * what accounts have saved.
 */
export const themes = [
  { id: "light-2", name: "Light mode", background: "#f1f5f9" },
  { id: "minimal-neutrals", name: "Neutral", background: "#e6e6e6" },
  { id: "warm-neutrals", name: "Warm", background: "#fff3db" },
  { id: "graphite", name: "Graphite", background: "#1f2023" },
  { id: "dark-1", name: "Ocean", background: "#0b1120" },
  { id: "space", name: "Space", background: "#070818" },
] as const;

export type Theme = (typeof themes)[number]["id"];

/**
 * Out of the box: logged out (/apps, the login pages), and a new account's
 * until they pick another in Account (lib/users.ts sets it at sign-up; it is
 * the database's default too).
 */
export const defaultTheme: Theme = "light-2";

const ids: ReadonlySet<string> = new Set(themes.map((theme) => theme.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && ids.has(value);
}

export function themeBackground(theme: Theme): string {
  return themes.find((info) => info.id === theme)?.background ?? themeBackground(defaultTheme);
}
