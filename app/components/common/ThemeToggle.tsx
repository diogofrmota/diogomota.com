import type { Theme } from "@/lib/users";
import { MoonIcon, SunIcon } from "./icons";
import styles from "./ThemeToggle.module.css";

// Light/dark switch in the apps' top bar: a toggle button that is pressed in the
// dark theme. The icon shows the current theme.
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => onChange(dark ? "light" : "dark")}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
