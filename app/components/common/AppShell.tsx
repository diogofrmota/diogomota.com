"use client";

import { usePathname } from "next/navigation";
import { Activity, useCallback, useMemo, useState } from "react";
import { AppViewContext, useAppViewHistory } from "@/hooks/useAppView";
import { themeBackground, type Theme } from "@/lib/themes";
import { AppHeader } from "./AppHeader";
import { HeaderTabs } from "./HeaderTabs";
import styles from "./AppShell.module.css";
import themeStyles from "./themes.module.css";

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
 * The frame of the apps and the pages around them (/apps, /account,
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
    <div className={`${themeStyles.theme} ${styles.shell} ${nav ? "" : styles.withoutNav}`} data-theme={theme}>
      {/* Browser UI color on mobile. React moves it into <head>. */}
      <meta name="theme-color" content={themeBackground(theme)} />
      <AppHeader pathname={pathname} username={username} next={next} brand={brand} account={account}
        tabs={nav && <HeaderTabs {...nav} />} />
      <main className={styles.main}>{children}</main>
      {overlay}
    </div>
  );
}

// An app in the frame: the top bar (the app's tabs in the middle, the account
// menu, with Switch app, on the right) and the current view. An app with
// settings has them as one of its tabs (Shared's Settings). The URL stays the
// same; useAppView keeps the view in history entries for the back button.
//
// Views that are switched away from stay mounted but hidden (<Activity>), so
// they keep their state; their effects stop until they are shown again. The
// view shown slides in from the side of its tab (AppShell.module.css: a hidden
// view's animation starts again when it is shown): from the right for a tab
// further right, from the left for one further left. The switch itself is
// immediate, so nothing waits on the animation.
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
  /** The user's saved theme, rendered by the server. It is changed in /account. */
  theme: Theme;
  hideNavigation?: boolean;
  /** Shown over every view, such as the app's dialogs; can use useAppView(). */
  children?: React.ReactNode;
}) {
  const ids = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const history = useAppViewHistory(ids);
  const { view, setView: showView } = history;
  // Which side the next view comes in from: every switch of view, from the
  // tabs or from inside a view (a link to Discover), says.
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const setView = useCallback((next: string) => {
    if (next !== view) setDirection(ids.indexOf(next) > ids.indexOf(view) ? "forward" : "back");
    showView(next);
  }, [ids, view, showView]);
  const appView = useMemo(() => ({ ...history, setView }), [history, setView]);

  function selectTab(id: string) {
    if (id !== view) window.scrollTo(0, 0);
    setView(id);
  }

  const nav = { label: name, tabs, current: view, onSelect: selectTab };
  return (
    <AppViewContext value={appView}>
      <AppFrame theme={theme} username={username} brand={false} nav={hideNavigation ? undefined : nav} overlay={children}>
        <div className={styles.views} data-direction={direction}>
          {tabs.map((tab) => (
            <Activity key={tab.id} mode={tab.id === view ? "visible" : "hidden"}>
              {tab.view}
            </Activity>
          ))}
        </div>
      </AppFrame>
    </AppViewContext>
  );
}
