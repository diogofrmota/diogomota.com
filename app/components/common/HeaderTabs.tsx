import Link from "next/link";
import { authHref } from "@/lib/next-path";
import { siteDomain } from "@/lib/site";
import { Avatar } from "./Avatar";
import { HomeIcon, LoginIcon, UserPlusIcon } from "./icons";
import { LinkPending } from "./LinkPending";
import { SegmentThumb } from "./motion";

import type { TabNavProps } from "./AppShell";
import shell from "./AppShell.module.css";

/** The tab of a page outside the apps that is current: home, account, or one of the login pages. */
export type LauncherTab = "home" | "account" | "login" | "signup";

/** The current tab's underline: one per tab bar (its layoutId), sliding from tab to tab. */
function Underline({ bar }: { bar: string }) {
  return <SegmentThumb layoutId={`tab-underline:${bar}`} className={shell.underline} />;
}

/**
 * The site's name on the left of the header, on a wide screen (where the tab
 * bar is the header, and says where you are): to /. A phone's tab bar is along
 * the bottom, with Home in it.
 */
function Brand() {
  return (
    <Link href="/" className={shell.brand}>
      <span aria-hidden="true" className={shell.brandMark}>
        &gt;_
      </span>
      {siteDomain}
    </Link>
  );
}

/** Home, at the end of every tab bar: /, the apps, and the way from one app to another. */
function HomeTab({ current = false }: { current?: boolean }) {
  return (
    <li>
      <Link href="/" aria-current={current ? "page" : undefined}>
        <LinkPending icon={<HomeIcon />} />
        Home
        {current && <Underline bar="launcher" />}
      </Link>
    </li>
  );
}

/**
 * The tab bar of every page outside the apps (home, /account, the login
 * pages, /privacy, an invite, the 404): Account (with the profile picture)
 * and Home, the current one marked; Log out is on /account. Logged out, Log in
 * and Sign up in Account's place, each its own icon. `current` is none on the
 * pages that aren't one of the tabs.
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
      <Brand />
      <ul>
        {username ? (
          <li>
            <Link href="/account" aria-current={current === "account" ? "page" : undefined}>
              <Avatar username={username} name={name} url={avatarUrl} className={shell.navAvatar} />
              Account
              <LinkPending />
              {current === "account" && <Underline bar="launcher" />}
            </Link>
          </li>
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
        <HomeTab current={current === "home"} />
      </ul>
    </nav>
  );
}

/**
 * An app's tab bar: its tabs, each its icon and name, then Home. Along the
 * bottom of a phone's screen, across the top of a wider one (AppShell.module.css).
 */
export function TabBar({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={shell.tabBar}>
      <Brand />
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
        <HomeTab />
      </ul>
    </nav>
  );
}
