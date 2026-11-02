"use client";

import Link from "next/link";
import { Activity, useMemo } from "react";
import { AccountMenu } from "@/components/account/AccountMenu";
import { AppViewContext, useAppViewHistory } from "@/hooks/useAppView";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/users";
import { BottomNav } from "./BottomNav";
import { BackIcon } from "./icons";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./AppShell.module.css";

export type AppTab = {
  /** Unique within the app; saved in history entries (useAppView). */
  id: string;
  label: string;
  icon: React.ReactNode;
  view: React.ReactNode;
};

/** What the tab bars need to show the tabs and switch between them. */
export type TabNavProps = {
  /** Names the navigation landmark: the app's name. */
  label: string;
  tabs: readonly AppTab[];
  current: string;
  onSelect: (id: string) => void;
};

// The frame of every app: a top bar (back to /apps, the app's name, the theme
// toggle and the account menu), the app's tabs as a sidebar on desktop or a
// bottom bar on mobile, and the current tab's view. The URL stays the same;
// useAppView keeps the view in history entries for the back button.
//
// Views that are switched away from stay mounted but hidden (<Activity>), so
// they keep their state; their effects stop until they are shown again.
export function AppShell({
  name,
  tabs,
  username,
  theme: savedTheme,
  hideNavigation = false,
}: {
  name: string;
  /** The first tab is the default view. */
  tabs: readonly AppTab[];
  username: string;
  theme: Theme;
  hideNavigation?: boolean;
}) {
  const ids = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const appView = useAppViewHistory(ids);
  const [theme, setTheme] = useTheme(savedTheme);

  function selectTab(id: string) {
    if (id !== appView.view) window.scrollTo(0, 0);
    appView.setView(id);
  }

  return (
    <AppViewContext value={appView}>
      <div className={`${styles.shell} ${hideNavigation ? styles.withoutNav : ""}`} data-theme={theme}>
        {/* Browser UI color on mobile. React moves it into <head>. */}
        <meta name="theme-color" content={theme === "light" ? "#ffffff" : "#0a0a0a"} />
        <header className={styles.topBar}>
          <Link href="/apps" className={styles.back} aria-label="Back to Apps">
            <BackIcon />
            Apps
          </Link>
          <span className={styles.appName}>{name}</span>
          <div className={styles.actions}>
            <ThemeToggle theme={theme} onChange={setTheme} />
            <nav aria-label="Account" className={styles.account}>
              <AccountMenu username={username} />
            </nav>
          </div>
        </header>
        {!hideNavigation && <Sidebar label={name} tabs={tabs} current={appView.view} onSelect={selectTab} />}
        <main className={styles.main}>
          {tabs.map((tab) => (
            <Activity key={tab.id} mode={tab.id === appView.view ? "visible" : "hidden"}>
              {tab.view}
            </Activity>
          ))}
        </main>
        {!hideNavigation && <BottomNav label={name} tabs={tabs} current={appView.view} onSelect={selectTab} />}
      </div>
    </AppViewContext>
  );
}
