import Link from "next/link";
import { authHref } from "@/lib/next-path";
import { Avatar } from "./Avatar";
import { AppsIcon, UserIcon } from "./icons";
import { LinkPending } from "./LinkPending";
import { SegmentThumb } from "./motion";

import type { TabNavProps } from "./AppShell";
import shell from "./AppShell.module.css";

/** The current tab's underline: one per tab bar (its layoutId), sliding from tab to tab. */
function Underline({ bar }: { bar: string }) {
  return <SegmentThumb layoutId={`tab-underline:${bar}`} className={shell.underline} />;
}

/** Apps, at the end of every tab bar: the launcher, the way from one app to another. */
function AppsTab({ current = false }: { current?: boolean }) {
  return (
    <li>
      <Link href="/apps" aria-current={current ? "page" : undefined}>
        <LinkPending icon={<AppsIcon />} />
        Apps
        {current && <Underline bar="launcher" />}
      </Link>
    </li>
  );
}

/**
 * The tab bar of /apps and /account: Account (with the profile picture) and
 * Apps, the current one marked; Log out is on /account. Logged out, Log in and
 * Sign up in Account's place.
 */
export function LauncherTabs({
  current,
  username,
  avatarUrl,
  next,
}: {
  current: "apps" | "account";
  username: string | null;
  avatarUrl?: string | null;
  next?: string | null;
}) {
  return (
    <nav aria-label="Account" className={shell.tabBar}>
      <ul>
        {username ? (
          <li>
            <Link href="/account" aria-current={current === "account" ? "page" : undefined}>
              <Avatar username={username} url={avatarUrl} className={shell.navAvatar} />
              Account
              <LinkPending />
              {current === "account" && <Underline bar="launcher" />}
            </Link>
          </li>
        ) : (
          <>
            <li>
              <Link href={authHref("/login", next)}>
                <LinkPending icon={<UserIcon />} />
                Log in
              </Link>
            </li>
            <li>
              <Link href={authHref("/signup", next)}>
                <LinkPending icon={<UserIcon />} />
                Sign up
              </Link>
            </li>
          </>
        )}
        <AppsTab current={current === "apps"} />
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
