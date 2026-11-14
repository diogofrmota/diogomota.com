"use client";

import { usePathname } from "next/navigation";
import { Activity, useCallback, useMemo, useState } from "react";
import { AppViewContext, useAppViewHistory, type AppViewState } from "@/hooks/useAppView";
import { themeBackground, type Theme } from "@/lib/themes";
import { AppHeader } from "./AppHeader";
import { LauncherTabs, TabBar } from "./HeaderTabs";
import { OfflineSupport } from "./OfflineSupport";
import styles from "./AppShell.module.css";
import themeStyles from "./themes.module.css";

export type AppTab = {
  /** Unique within the app; the path of its view (/shows/discover) and saved in history entries (useAppView). */
  id: string;
  label: string;
  /** With its label in the tab bar: over it on a phone, beside it on a wider screen. */
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
 * The frame of the apps and the pages around them (/apps, /account,
 * the login pages), in the user's theme. The apps, /apps and /account have a
 * tab bar (HeaderTabs): along the bottom of a phone's screen, within reach of a
 * thumb, and across the top of a wider one, as its header. The other pages
 * (the login pages, /privacy) have the top bar (AppHeader). With an app's
 * tabs, the page has the whole width; without (/apps and the rest, Shared
 * before there is a space) it is a centered column.
 */
export function AppFrame({
  theme,
  username,
  avatarUrl,
  next,
  brand,
  account,
  launcher,
  nav,
  children,
  overlay,
}: {
  theme: Theme;
  /** Null when logged out: the bar has Log in and Sign up. */
  username: string | null;
  /** The user's profile picture, in the account menu and the tab bar's Account (lib/users.ts). */
  avatarUrl?: string | null;
  /** Where Log in and Sign up return to. */
  next?: string | null;
  /** diogomota.com on the left of the top bar (AppHeader). False in an app, which has its tab bar instead. */
  brand?: boolean;
  /** The account menu, or Log in and Sign up (AppHeader). */
  account?: boolean;
  /** /apps or /account: their tab bar, Account and Apps, with this one current. */
  launcher?: "apps" | "account";
  nav?: TabNavProps;
  /** The page, in <main>. */
  children: React.ReactNode;
  /** Over the page, such as the app's dialogs. */
  overlay?: React.ReactNode;
}) {
  const pathname = usePathname();
  const inApp = !!nav || brand === false;
  const tabBar = !!launcher || inApp;
  return (
    <div
      className={`${themeStyles.theme} ${styles.shell} ${nav ? "" : styles.withoutNav} ${tabBar ? styles.withNav : ""}`}
      data-theme={theme}
    >
      {/* Browser UI color on mobile. React moves it into <head>. */}
      <meta name="theme-color" content={themeBackground(theme)} />
      {/* Before the page: the header on a wide screen (sticky), fixed to the bottom on a phone. */}
      {launcher ? (
        <LauncherTabs current={launcher} username={username} avatarUrl={avatarUrl} next={next} />
      ) : inApp ? (
        // Shared before there is a space: no tabs yet, only Apps.
        <TabBar {...(nav ?? { label: "Shared", tabs: [], current: "", onSelect: () => {} })} />
      ) : (
        <AppHeader
          pathname={pathname}
          username={username}
          avatarUrl={avatarUrl}
          next={next}
          brand={brand}
          account={account}
        />
      )}
      <main
        className={`${styles.main} ${nav?.label === "Shared" && nav.current === "calendar" ? styles.calendarMain : ""}`}
      >
        {children}
      </main>
      {overlay}
    </div>
  );
}

// An app in the frame: the current view and its tab bar, including Apps, the
// way to the launcher, where Account is. The view and the open panels
// are in the URL (useAppView), so Back, reload and links work.
//
// Views that are switched away from stay mounted but hidden (<Activity>), so
// they keep their state; their effects stop until they are shown again. The
// view shown slides in from the side of its tab (AppShell.module.css: a hidden
// view's animation starts again when it is shown): from the right for a tab
// further right, from the left for one further left. The switch itself is
// immediate, so nothing waits on the animation.
export function AppShell({
  name,
  basePath,
  initial,
  tabs,
  username,
  avatarUrl,
  theme,
  hideNavigation = false,
  children,
}: {
  name: string;
  /** The app's path: /shows. Its views are under it: /shows/discover. */
  basePath: string;
  /** The view and panels of the URL the page was loaded on (the server reads them). */
  initial: AppViewState;
  /** The first tab is the default view. */
  tabs: readonly AppTab[];
  username: string;
  /** The user's profile picture, in the account menu. */
  avatarUrl?: string | null;
  /** The user's saved theme, rendered by the server. It is changed in /account. */
  theme: Theme;
  hideNavigation?: boolean;
  /** Shown over every view, such as the app's dialogs; can use useAppView(). */
  children?: React.ReactNode;
}) {
  const ids = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const history = useAppViewHistory(basePath, ids, initial);
  const { view, setView: showView } = history;
  // Which side the next view comes in from: every switch of view, from the
  // tabs or from inside a view (a link to Discover), says.
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const setView = useCallback(
    (next: string) => {
      if (next !== view) setDirection(ids.indexOf(next) > ids.indexOf(view) ? "forward" : "back");
      showView(next);
    },
    [ids, view, showView],
  );
  const appView = useMemo(() => ({ ...history, setView }), [history, setView]);

  function selectTab(id: string) {
    if (id !== view) window.scrollTo(0, 0);
    setView(id);
  }

  const nav = { label: name, tabs, current: view, onSelect: selectTab };
  return (
    <AppViewContext value={appView}>
      <OfflineSupport />
      <AppFrame
        theme={theme}
        username={username}
        avatarUrl={avatarUrl}
        brand={false}
        nav={hideNavigation ? undefined : nav}
        overlay={children}
      >
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
