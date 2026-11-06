import { useId } from "react";
import { themes, type Theme } from "@/lib/themes";
import styles from "./ThemePicker.module.css";
import themeStyles from "./themes.module.css";

/**
 * Every theme, as radio buttons named "theme", read when the form around them
 * is submitted (Account). Each is a card with a sample of the theme: its page,
 * a card with text on it, and its accent. The recommended ones have a star
 * after the name, which screen readers hear as the radio's description
 * ("Recommended") rather than part of its name. Goes in a fieldset that names it.
 */
export function ThemeOptions({ defaultValue }: { defaultValue: Theme }) {
  const recommendedId = useId();
  return (
    <div className={styles.grid}>
      <span id={recommendedId} hidden>
        Recommended
      </span>
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
            <input
              type="radio"
              name="theme"
              value={theme.id}
              defaultChecked={defaultValue === theme.id}
              aria-describedby={theme.recommended ? recommendedId : undefined}
            />
            {theme.name}
            {theme.recommended && (
              <span className={styles.star} title="Recommended" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
                  <path d="M12 2.75l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17.35l-5.72 3.01 1.09-6.37-4.63-4.51 6.4-.93z" />
                </svg>
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
