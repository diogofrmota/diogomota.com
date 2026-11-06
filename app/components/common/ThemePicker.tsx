import { themes, type Theme } from "@/lib/themes";
import styles from "./ThemePicker.module.css";
import themeStyles from "./themes.module.css";

/**
 * Every theme, as radio buttons named "theme", read when the form around them
 * is submitted (Account). Each is a card with a sample of the theme: its page,
 * a card with text on it, and its accent. Goes in a fieldset that names it.
 */
export function ThemeOptions({ defaultValue }: { defaultValue: Theme }) {
  return (
    <div className={styles.grid}>
      {themes.map((theme) => (
        <label key={theme.id} className={styles.option}>
          <span className={`${themeStyles.theme} ${styles.sample}`} data-theme-preview={theme.id} aria-hidden="true">
            <span className={styles.sampleCard}>
              <span className={styles.sampleText} />
              <span className={styles.sampleMuted} />
            </span>
            <span className={styles.sampleAccent} />
          </span>
          <span className={styles.name}>
            <input type="radio" name="theme" value={theme.id} defaultChecked={defaultValue === theme.id} />
            {theme.name}
          </span>
        </label>
      ))}
    </div>
  );
}
