import type { TabNavProps } from "./AppShell";
import styles from "./BottomNav.module.css";

// The app's tabs in a bar along the bottom, on mobile (hidden on wide screens,
// where the top bar's HeaderTabs take over). Buttons rather than links: the URL
// never changes.
export function BottomNav({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={styles.bottomNav}>
      <ul className={styles.list}>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              className={styles.tab}
              aria-current={tab.id === current ? "page" : undefined}
              onClick={() => onSelect(tab.id)}
            >
              {tab.icon}
              <span className={styles.label}>{tab.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
