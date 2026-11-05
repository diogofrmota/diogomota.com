"use client";

import { usePathname } from "next/navigation";
import { Activity, useMemo } from "react";
import { AppViewContext, useAppViewHistory } from "@/hooks/useAppView";
import type { Theme } from "@/lib/users";
import { BottomNav } from "./BottomNav";
import { AppHeader } from "./AppHeader";
import { HeaderTabs } from "./HeaderTabs";
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

/**
 * The frame of the app pages, in the user's theme: the top bar, the page, and
 * with tabs, the tabs again as a bottom bar on mobile. Without tabs (/settings,
 * Shared before there is a space) the page is a centered column.
 */
export function AppFrame({ theme, username, nav, actions, children, overlay }: {
  theme: Theme;
  username: string;
  nav?: TabNavProps;
  /** The app's own buttons in the top bar, before the account menu. */
  actions?: React.ReactNode;
  /** The page, in <main>. */
  children: React.ReactNode;
  /** Over the page, such as the app's dialogs. */
  overlay?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className={`${styles.shell} ${nav ? "" : styles.withoutNav}`} data-theme={theme}>
      {/* Browser UI color on mobile. React moves it into <head>. */}
      <meta name="theme-color" content={theme === "light" ? "#ffffff" : "#0a0a0a"} />
      <AppHeader pathname={pathname} username={username} actions={actions} tabs={nav && <HeaderTabs {...nav} />} />
      <main className={styles.main}>{children}</main>
      {nav && <BottomNav {...nav} />}
      {overlay}
    </div>
  );
}

// An app in the frame: the top bar (diogomota.com, the apps, the app's tabs in
// the middle on desktop, the account menu), the tabs again as a bottom bar on
// mobile, and the current view. The apps' settings are a page of their own,
// /settings, opened from the account menu. The URL stays the same; useAppView
// keeps the view in history entries for the back button.
//
// Views that are switched away from stay mounted but hidden (<Activity>), so
// they keep their state; their effects stop until they are shown again.
export function AppShell({
  name,
  tabs,
  username,
  theme,
  hideNavigation = false,
  actions,
  children,
}: {
  name: string;
  /** The first tab is the default view. */
  tabs: readonly AppTab[];
  username: string;
  /** The user's saved theme, rendered by the server. It is changed in /settings or /account. */
  theme: Theme;
  hideNavigation?: boolean;
  /** The app's own buttons in the top bar, before the account menu. */
  actions?: React.ReactNode;
  /** Shown over every view, such as the app's dialogs; can use useAppView(). */
  children?: React.ReactNode;
}) {
  const ids = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const appView = useAppViewHistory(ids);

  function selectTab(id: string) {
    if (id !== appView.view) window.scrollTo(0, 0);
    appView.setView(id);
  }

  const nav = { label: name, tabs, current: appView.view, onSelect: selectTab };
  return (
    <AppViewContext value={appView}>
      <AppFrame theme={theme} username={username} actions={actions} nav={hideNavigation ? undefined : nav} overlay={children}>
        {tabs.map((tab) => (
          <Activity key={tab.id} mode={tab.id === appView.view ? "visible" : "hidden"}>
            {tab.view}
          </Activity>
        ))}
      </AppFrame>
    </AppViewContext>
  );
}
