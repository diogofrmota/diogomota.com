/**
 * The themes a user can pick, in /account and /settings, in the order they are
 * listed there. Each one's colors are in components/common/themes.module.css,
 * under its id, and the database accepts only these ids (db/migrations): a new
 * theme goes in all three. `background` is the theme's --bg, for the browser's
 * own UI on mobile (<meta name="theme-color">).
 */
export const themes = [
  { id: "light-2", name: "Light 2", background: "#f1f5f9" },
  { id: "light-3", name: "Light 3", background: "#ffffff" },
  { id: "dark-1", name: "Dark 1", background: "#0b1120" },
  { id: "dark-2", name: "Dark 2", background: "#000000" },
  { id: "earth-tones", name: "Earth tones", background: "#f8f3ec" },
  { id: "warm-neutrals", name: "Warm neutrals", background: "#fff3db" },
  { id: "cool-blues", name: "Cool blues", background: "#0d1e21" },
  { id: "minimal-neutrals", name: "Minimal neutrals", background: "#e6e6e6" },
  { id: "pastels", name: "Pastels", background: "#f5f2f7" },
  { id: "vivid-nightfall", name: "Vivid nightfall", background: "#10002b" },
  { id: "iron", name: "Iron", background: "#1b1e21" },
  { id: "graphite", name: "Graphite", background: "#1f2023" },
  { id: "blueprint", name: "Blueprint", background: "#123a6b" },
  { id: "grass", name: "Grass", background: "#f1f6ec" },
  { id: "rocky-mountains", name: "Rocky Mountains", background: "#19212b" },
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
