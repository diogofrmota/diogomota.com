import type { TabNavProps } from "./AppShell";
import { NavLabel } from "./AppHeader";
import styles from "./AppHeader.module.css";

// The app's tabs, on the left of the top bar at every width. Buttons rather
// than links: the URL never changes.
export function HeaderTabs({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label}>
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
