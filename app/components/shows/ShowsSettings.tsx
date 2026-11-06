"use client";
import ui from "@/components/common/ui.module.css";
import type { Theme } from "@/lib/users";

/**
 * Shows' settings, in Settings (/settings): the theme, which applies in both apps.
 * Each change is saved to the account straight away (hooks/useTheme.ts).
 */
export function ShowsSettings({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  return <div className={ui.stack}>
    <section className={ui.card} aria-labelledby="theme-heading">
      <h2 id="theme-heading" className={ui.cardHeading}>Theme</h2>
      <fieldset className={ui.choices} aria-labelledby="theme-heading" aria-describedby="theme-hint">
        <p id="theme-hint" className={ui.muted}>Your theme preference applies across your apps.</p>
        {(["light", "dark"] as const).map((value) => <label key={value} className={ui.choice}>
          <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => onThemeChange(value)} />
          {value === "light" ? "Light" : "Dark"}
        </label>)}
      </fieldset>
    </section>
  </div>;
}
