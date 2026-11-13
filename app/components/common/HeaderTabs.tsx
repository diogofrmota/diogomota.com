import type { TabNavProps } from "./AppShell";
import { NavLabel } from "./AppHeader";
import styles from "./AppHeader.module.css";
import shell from "./AppShell.module.css";

// The app's tabs. Buttons rather than links: switching views never loads a page
// (useAppView puts each in the URL). One set is shown at a time: the top bar's
// on a wide screen, the bottom bar's on a phone; the other is display: none,
// out of the accessibility tree.

/** In the middle of the top bar, on a wide screen. */
export function HeaderTabs({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={styles.headerTabs}>
      <ul className={styles.tabList}>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              className={styles.link}
              aria-current={tab.id === current ? "page" : undefined}
              onClick={() => onSelect(tab.id)}
            >
              <NavLabel>{tab.label}</NavLabel>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Along the bottom of a phone's screen, within reach of a thumb: each tab its icon over its name. */
export function BottomTabs({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={shell.bottomTabs}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              aria-current={tab.id === current ? "page" : undefined}
              onClick={() => onSelect(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
