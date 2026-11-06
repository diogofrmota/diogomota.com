"use client";

import { usePathname } from "next/navigation";
import { Activity, useMemo } from "react";
import { AppViewContext, useAppViewHistory } from "@/hooks/useAppView";
import type { Theme } from "@/lib/users";
import { AppHeader } from "./AppHeader";
import { HeaderTabs } from "./HeaderTabs";
import styles from "./AppShell.module.css";

export type AppTab = {
  /** Unique within the app; saved in history entries (useAppView). */
  id: string;
  label: string;
  view: React.ReactNode;
};

/** What the top bar needs to show the tabs and switch between them. */
export type TabNavProps = {
  /** Names the navigation landmark: the app's name. */
  label: string;
  tabs: readonly AppTab[];
  current: string;
  onSelect: (id: string) => void;
};

/**
 * The frame of the apps and the pages around them (/apps, /settings, /account,
 * the login pages), in the user's theme: the top bar, then the page. With tabs,
 * the page has the whole width; without (/apps and the rest, Shared before
 * there is a space) it is a centered column.
 */
export function AppFrame({ theme, username, next, brand, account, nav, children, overlay }: {
  theme: Theme;
  /** Null when logged out: the top bar has Login and Sign Up. */
  username: string | null;
  /** Where Login and Sign Up return to. */
  next?: string | null;
  /** diogomota.com on the left of the top bar (AppHeader). */
  brand?: boolean;
  /** The account menu, or Login and Sign Up (AppHeader). */
  account?: boolean;
  nav?: TabNavProps;
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
      <AppHeader pathname={pathname} username={username} next={next} brand={brand} account={account}
        tabs={nav && <HeaderTabs {...nav} />} />
      <main className={styles.main}>{children}</main>
      {overlay}
    </div>
  );
}

// An app in the frame: the top bar (the app's tabs in the middle, the account
// menu, with Settings and Switch app, on the right) and the current view. The apps' settings are a page
// of their own, /settings, opened from the account menu. The URL stays the
// same; useAppView keeps the view in history entries for the back button.
//
// Views that are switched away from stay mounted but hidden (<Activity>), so
// they keep their state; their effects stop until they are shown again.
export function AppShell({
  name,
  tabs,
  username,
  theme,
  hideNavigation = false,
  children,
}: {
  name: string;
  /** The first tab is the default view. */
  tabs: readonly AppTab[];
  username: string;
  /** The user's saved theme, rendered by the server. It is changed in /settings or /account. */
  theme: Theme;
  hideNavigation?: boolean;
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
      <AppFrame theme={theme} username={username} brand={false} nav={hideNavigation ? undefined : nav} overlay={children}>
        {tabs.map((tab) => (
          <Activity key={tab.id} mode={tab.id === appView.view ? "visible" : "hidden"}>
            {tab.view}
          </Activity>
        ))}
      </AppFrame>
    </AppViewContext>
  );
}
