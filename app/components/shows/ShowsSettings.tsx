"use client";
import { ThemeOptions } from "@/components/common/ThemePicker";
import ui from "@/components/common/ui.module.css";
import type { Theme } from "@/lib/themes";

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
        <ThemeOptions value={theme} onChange={onThemeChange} />
      </fieldset>
    </section>
  </div>;
}
