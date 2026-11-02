import type { TabNavProps } from "./AppShell";
import styles from "./Sidebar.module.css";

// The app's tabs down the left side, on desktop (hidden on narrow screens, where
// BottomNav takes over). Buttons rather than links: the URL never changes.
export function Sidebar({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={styles.sidebar}>
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
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
