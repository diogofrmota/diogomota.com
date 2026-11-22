"use client";

import { Activity, useCallback, useMemo, useState } from "react";
import { AppViewContext, useAppViewHistory, type AppViewState } from "@/hooks/useAppView";
import { themeBackground, type Theme } from "@/lib/themes";
import { TopBar, type BackTarget } from "./HeaderTabs";
import { OfflineSupport } from "./OfflineSupport";
import styles from "./AppShell.module.css";
import themeStyles from "./themes.module.css";

export type AppTab = {
  /** Unique within the app; the path of its view (/shows/discover) and saved in history entries (useAppView). */
  id: string;
  label: string;
  /** With its label in the tab bar: over it on a phone, beside it on a wider screen (an app with one view has no tabs). */
  icon: React.ReactNode;
  view: React.ReactNode;
};

/** What the tab bar needs to show the tabs and switch between them. */
export type TabNavProps = {
  /** Names the navigation landmark: the app's name. */
  label: string;
  tabs: readonly AppTab[];
  current: string;
  onSelect: (id: string) => void;
};

/**
 * The frame of the apps and every page around them (/ logged in, /account, the
 * login pages, /privacy, an invite, the group's settings, the 404), in the
 * user's theme, with a top bar (HeaderTabs' TopBar): ‹ Home on the left (to /:
 * logged in, the profile and the folders; logged out, the front page), the
 * app's name in an app, and the user's picture on the right, the way to
 * Account. An app with views of its own has its tabs in it too: along the
 * bottom of a phone's screen, within reach of a thumb, and in the middle of
 * the bar on a wider one. In an app (its tabs, or its one view, as Calendar's)
 * the page has the whole width; without (/account and the rest, For Couples'
 * apps before there is a group) it is a centered column. `bare` leaves the bar
 * out: on / logged in, whose profile and folders are the way to everything,
 * and on the error page, which can't tell who is logged in.
 */
export function AppFrame({
  theme,
  username,
  name,
  avatarUrl,
  current,
  inApp = false,
  appName,
  bare = false,
  back,
  nav,
  children,
  overlay,
}: {
  theme: Theme;
  /** Null when logged out: no Account in the top bar. */
  username: string | null;
  /** The user's name, for the initials in Account's picture without one. */
  name?: string | null;
  /** The user's profile picture, Account's in the top bar (lib/users.ts). */
  avatarUrl?: string | null;
  /** On /account, which the top bar doesn't link to. */
  current?: "account";
  /** An app's page: its name in the top bar, and its tabs (nav) once it has them (For Couples' apps before there is a group don't). */
  inApp?: boolean;
  /** The app, named in the top bar: its tabs' name (nav's label) without it. */
  appName?: string;
  bare?: boolean;
  /** Where the top bar's link on the left goes: ‹ Home without it. */
  back?: BackTarget;
  nav?: TabNavProps;
  /** The page, in <main>. */
  children: React.ReactNode;
  /** Over the page, such as the app's dialogs. */
  overlay?: React.ReactNode;
}) {
  const app = inApp || !!nav;
  const tabs = !bare && !!nav && nav.tabs.length > 1;
  return (
    <div
      className={`${themeStyles.theme} ${styles.shell} ${nav ? "" : styles.withoutNav} ${bare ? "" : styles.withTopBar} ${tabs ? styles.withTabs : ""}`}
      data-theme={theme}
    >
      {/* Browser UI color on mobile. React moves it into <head>. */}
      <meta name="theme-color" content={themeBackground(theme)} />
      {/* Before the page: sticky at the top, its tabs (if any) fixed to the bottom on a phone. */}
      {bare ? null : (
        <TopBar
          title={app ? (appName ?? nav?.label) : undefined}
          back={back}
          nav={nav}
          username={username}
          name={name}
          avatarUrl={avatarUrl}
          onAccount={current === "account"}
        />
      )}
      <main
        className={`${styles.main} ${nav?.label === "Calendar" && nav.current === "calendar" ? styles.calendarMain : ""}`}
      >
        {children}
      </main>
      {overlay}
    </div>
  );
}

// An app in the frame: the current view, and its tabs when it has more than
// one, under a top bar with ‹ Home (the way to the other apps) and Account.
// The view and the open panels are in the URL (useAppView), so Back, reload
// and links work.
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
  /** The user's profile picture, Account's in the top bar. */
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
        inApp
        appName={name}
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
