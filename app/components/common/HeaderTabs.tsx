import Link from "next/link";
import { authHref } from "@/lib/next-path";
import { Avatar } from "./Avatar";
import { AppsIcon, LoginIcon, UserPlusIcon } from "./icons";
import { LinkPending } from "./LinkPending";
import { SegmentThumb } from "./motion";

import type { TabNavProps } from "./AppShell";
import shell from "./AppShell.module.css";

/** The tab of a page outside the apps that is current: account, or one of the login pages. */
export type LauncherTab = "account" | "login" | "signup";

/** The current tab's underline: one per tab bar (its layoutId), sliding from tab to tab. */
function Underline({ bar }: { bar: string }) {
  return <SegmentThumb layoutId={`tab-underline:${bar}`} className={shell.underline} />;
}

/** Apps, at the end of every tab bar: /, the apps, and the way from one app to another. */
function AppsTab() {
  return (
    <li>
      <Link href="/">
        <LinkPending icon={<AppsIcon />} />
        Apps
      </Link>
    </li>
  );
}

/**
 * The tab bar of the pages outside the apps (/account, the login pages,
 * /privacy, an invite, the 404; / itself has none, its icons are the way
 * on): Account (with the profile picture) and Apps; on /account, only Apps,
 * the way back (Log out is on the page). Logged out, Log in and Sign up in
 * Account's place, each its own icon, the current one marked. `current` is
 * none on the pages that aren't one of the tabs.
 */
export function LauncherTabs({
  current,
  username,
  name,
  avatarUrl,
  next,
}: {
  current?: LauncherTab;
  username: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  next?: string | null;
}) {
  return (
    <nav aria-label="Account" className={shell.tabBar}>
      <ul>
        {username ? (
          current !== "account" && (
            <li>
              <Link href="/account">
                <Avatar username={username} name={name} url={avatarUrl} className={shell.navAvatar} />
                Account
                <LinkPending />
              </Link>
            </li>
          )
        ) : (
          <>
            <li>
              <Link href={authHref("/login", next)} aria-current={current === "login" ? "page" : undefined}>
                <LinkPending icon={<LoginIcon />} />
                Log in
                {current === "login" && <Underline bar="launcher" />}
              </Link>
            </li>
            <li>
              <Link href={authHref("/signup", next)} aria-current={current === "signup" ? "page" : undefined}>
                <LinkPending icon={<UserPlusIcon />} />
                Sign up
                {current === "signup" && <Underline bar="launcher" />}
              </Link>
            </li>
          </>
        )}
        <AppsTab />
      </ul>
    </nav>
  );
}

/**
 * An app's tab bar: its tabs, each its icon and name, then Apps. Along the
 * bottom of a phone's screen, across the top of a wider one (AppShell.module.css).
 */
export function TabBar({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={shell.tabBar}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              aria-current={tab.id === current ? "page" : undefined}
              data-tab={tab.id}
              onClick={() => onSelect(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
              {tab.id === current && <Underline bar={label} />}
            </button>
          </li>
        ))}
        <AppsTab />
      </ul>
    </nav>
  );
}
