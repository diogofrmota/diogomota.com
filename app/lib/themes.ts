/**
 * The themes a user can pick, in /account and /settings, in the order they are
 * listed there. Each one's colors are in components/common/themes.module.css,
 * under its id, and the database accepts only these ids (db/migrations): a new
 * theme goes in all three. `background` is the theme's --bg, for the browser's
 * own UI on mobile (<meta name="theme-color">).
 */
export const themes = [
  { id: "light", name: "Light", group: "Light & dark", background: "#ffffff" },
  { id: "light-1", name: "Light 1", group: "Light & dark", background: "#faf8f5" },
  { id: "light-2", name: "Light 2", group: "Light & dark", background: "#f1f5f9" },
  { id: "light-3", name: "Light 3", group: "Light & dark", background: "#ffffff" },
  { id: "dark", name: "Dark", group: "Light & dark", background: "#0a0a0a" },
  { id: "dark-1", name: "Dark 1", group: "Light & dark", background: "#0b1120" },
  { id: "dark-2", name: "Dark 2", group: "Light & dark", background: "#000000" },
  { id: "dark-3", name: "Dark 3", group: "Light & dark", background: "#1f1d1b" },
  { id: "earth-tones", name: "Earth tones", group: "Palettes", background: "#f8f3ec" },
  { id: "vibrant-greens", name: "Vibrant greens", group: "Palettes", background: "#1e1e1f" },
  { id: "warm-neutrals", name: "Warm neutrals", group: "Palettes", background: "#fff3db" },
  { id: "maroon-mood", name: "Maroon mood", group: "Palettes", background: "#f8f5f5" },
  { id: "bold-orange", name: "Bold orange", group: "Palettes", background: "#211302" },
  { id: "cool-blues", name: "Cool blues", group: "Palettes", background: "#0d1e21" },
  { id: "minimal-neutrals", name: "Minimal neutrals", group: "Palettes", background: "#e6e6e6" },
  { id: "pastels", name: "Pastels", group: "Palettes", background: "#f5f2f7" },
  { id: "vibrant-blues", name: "Vibrant blues", group: "Palettes", background: "#002846" },
  { id: "power-purple", name: "Power purple", group: "Palettes", background: "#312335" },
  { id: "vivid-nightfall", name: "Vivid nightfall", group: "Palettes", background: "#10002b" },
  { id: "iron", name: "Iron", group: "Nature & materials", background: "#1b1e21" },
  { id: "graphite", name: "Graphite", group: "Nature & materials", background: "#1f2023" },
  { id: "blueprint", name: "Blueprint", group: "Nature & materials", background: "#123a6b" },
  { id: "grass", name: "Grass", group: "Nature & materials", background: "#f1f6ec" },
  { id: "rocky-mountains", name: "Rocky Mountains", group: "Nature & materials", background: "#19212b" },
] as const;

export type Theme = (typeof themes)[number]["id"];

/** The groups the themes are listed in, in order. */
export const themeGroups = [...new Set(themes.map((theme) => theme.group))];

/** Logged out, and new accounts' (the database's default). */
export const defaultTheme: Theme = "dark";

const ids: ReadonlySet<string> = new Set(themes.map((theme) => theme.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && ids.has(value);
}

export function themeBackground(theme: Theme): string {
  return themes.find((info) => info.id === theme)?.background ?? themeBackground(defaultTheme);
}
