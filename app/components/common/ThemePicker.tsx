import { useId } from "react";
import { themeGroups, themes, type Theme } from "@/lib/themes";
import styles from "./ThemePicker.module.css";
import themeStyles from "./themes.module.css";

type Props =
  /** Settings: each pick applies, and is saved, straight away. */
  | { value: Theme; onChange: (theme: Theme) => void }
  /** A form's field, read when the form is submitted (Account). */
  | { defaultValue: Theme };

/**
 * Every theme, as radio buttons named "theme" under their group's heading.
 * Each is a card with a sample of the theme: its page, a card with text on it,
 * and its accent. Goes in a fieldset that names it.
 */
export function ThemeOptions(props: Props) {
  const id = useId();
  return (
    <div className={styles.groups}>
      {themeGroups.map((group, index) => (
        <div key={group} role="group" aria-labelledby={`${id}-${index}`}>
          <h3 id={`${id}-${index}`} className={styles.groupHeading}>
            {group}
          </h3>
          <div className={styles.grid}>
            {themes
              .filter((theme) => theme.group === group)
              .map((theme) => (
                <label key={theme.id} className={styles.option}>
                  <span
                    className={`${themeStyles.theme} ${styles.sample}`}
                    data-theme-preview={theme.id}
                    aria-hidden="true"
                  >
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
                      {...("onChange" in props
                        ? { checked: props.value === theme.id, onChange: () => props.onChange(theme.id) }
                        : { defaultChecked: props.defaultValue === theme.id })}
                    />
                    {theme.name}
                  </span>
                </label>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
