import type { Theme } from "@/lib/users";
import styles from "./AppSettings.module.css";

/** Settings available even before an app has any user content. */
export function AppSettings({ name, theme, onThemeChange, onBack }: {
  name: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onBack: () => void;
}) {
  return <section className={styles.settings}>
    <button type="button" className={styles.back} onClick={onBack}>Back to {name}</button>
    <h1>{name} Settings</h1>
    <fieldset className={styles.appearance}>
      <legend>Theme</legend>
      <p>Your theme preference applies across your apps.</p>
      {(["light", "dark"] as const).map((value) => <label key={value}>
        <input type="radio" name="app-theme" value={value} checked={theme === value}
          onChange={() => onThemeChange(value)} />
        {value === "light" ? "Light" : "Dark"}
      </label>)}
    </fieldset>
  </section>;
}
