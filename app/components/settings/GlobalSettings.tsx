"use client";
import { useSearchParams } from "next/navigation";
import { Activity, useState } from "react";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { SpaceSettings } from "@/components/shared/SpaceSettings";
import { ShowsSettings } from "@/components/shows/ShowsSettings";
import { useTheme } from "@/hooks/useTheme";
import { appId, apps, findApp } from "@/lib/apps";
import type { Space } from "@/lib/space-types";
import type { User } from "@/lib/users";
import styles from "./GlobalSettings.module.css";

/**
 * Every app's settings on one page (/settings), in the apps' frame and theme:
 * a dropdown picks the app, Shared or Shows, and its settings show under it.
 * The app is the URL's ?app= (the account menu opens the page on the app it's
 * in), so a reload or Back keeps it. Both apps' settings stay mounted
 * (<Activity>), so switching keeps what's in them.
 */
export function GlobalSettings({ user, initialSpace }: { user: User; initialSpace: Space | null }) {
  const [theme, setTheme] = useTheme(user.themePreference);
  const inUrl = appId(findApp(useSearchParams().get("app")) ?? apps[0]);
  // Shown straight away when picked; the URL follows. Follows the URL when it
  // changes some other way: the account menu's link from this page.
  const [app, setApp] = useState(inUrl);
  const [seen, setSeen] = useState(inUrl);
  if (inUrl !== seen) {
    setSeen(inUrl);
    setApp(inUrl);
  }

  function select(id: string) {
    setApp(id);
    window.history.replaceState(null, "", `?${new URLSearchParams({ app: id })}`);
  }

  const sections: Record<string, React.ReactNode> = {
    shared: <SpaceSettings initialSpace={initialSpace} userId={user.id} />,
    shows: <ShowsSettings theme={theme} onThemeChange={setTheme} />,
  };
  return <AppFrame theme={theme} username={user.username}>
    <div className={ui.view}>
      <h1 className={ui.heading}>Global Settings</h1>
      <div className={`${ui.field} ${styles.picker}`}>
        <label htmlFor="settings-app">App</label>
        <select id="settings-app" className={ui.input} value={app} onChange={(event) => select(event.target.value)}>
          {apps.map((info) => <option key={info.href} value={appId(info)}>{info.name}</option>)}
        </select>
      </div>
      {apps.map((info) => <Activity key={info.href} mode={appId(info) === app ? "visible" : "hidden"}>
        <section aria-label={`${info.name} settings`}>{sections[appId(info)]}</section>
      </Activity>)}
    </div>
  </AppFrame>;
}
