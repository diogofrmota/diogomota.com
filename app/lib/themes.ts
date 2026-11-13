/**
 * The themes a user can pick, in /account, in the order they are listed there.
 * Each one's colors are in components/common/themes.module.css, under its id.
 * The ids are older than the names, and stay: they're what accounts have saved.
 * The database takes any id (015_two_themes.sql); lib/users.ts shows the
 * default for one that isn't here, so a theme comes or goes without a
 * migration. `background` is the theme's --bg, for the browser's own UI on
 * mobile (<meta name="theme-color">) and the installed app's splash screen.
 */
export const themes = [
  { id: "minimal-neutrals", name: "Light", background: "#e6e6e6" },
  { id: "graphite", name: "Dark", background: "#1f2023" },
] as const;

export type Theme = (typeof themes)[number]["id"];

/**
 * Out of the box: logged out (/apps, the login pages), and a new account's
 * until they pick another in Account (the users column's default too).
 */
export const defaultTheme: Theme = "minimal-neutrals";

const ids: ReadonlySet<string> = new Set(themes.map((theme) => theme.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && ids.has(value);
}

export function themeBackground(theme: Theme): string {
  return themes.find((info) => info.id === theme)?.background ?? themeBackground(defaultTheme);
}
