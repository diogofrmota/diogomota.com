"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { ChevronLeftIcon } from "./icons";
import { LinkPending } from "./LinkPending";
import { SegmentThumb } from "./motion";

import type { TabNavProps } from "./AppShell";
import shell from "./AppShell.module.css";
import ui from "./ui.module.css";

/** Where the top bar's link on the left goes: home, or (on a friend's profile) back. */
export type BackTarget = {
  label: string;
  href: string;
  /** Back in the history when the page was opened from another of the site's, `href` when it was loaded here. */
  history?: boolean;
};

const home: BackTarget = { label: "Home", href: "/" };

/** Whether this page is the one the browser loaded, not one reached from another page of the site. */
function loadedHere() {
  const [entry] = performance.getEntriesByType("navigation");
  return !entry || entry.name === location.href;
}

/** ‹ Home (or ‹ Back), on the left of the top bar. */
function BackLink({ back }: { back: BackTarget }) {
  const router = useRouter();
  return (
    <Link
      href={back.href}
      className={shell.back}
      onClick={(event) => {
        if (!back.history || loadedHere()) return;
        event.preventDefault();
        router.back();
      }}
    >
      <LinkPending icon={<ChevronLeftIcon />} />
      {back.label}
    </Link>
  );
}

/** The current tab's underline: one per tab bar (its layoutId), sliding from tab to tab. */
function Underline({ bar }: { bar: string }) {
  return <SegmentThumb layoutId={`tab-underline:${bar}`} className={shell.underline} />;
}

/**
 * An app's tabs, each its icon and name: along the bottom of a phone's screen,
 * in the middle of the top bar on a wider one (AppShell.module.css). Only for
 * an app with views of its own to switch between.
 */
function TabBar({ label, tabs, current, onSelect }: TabNavProps) {
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
      </ul>
    </nav>
  );
}

/**
 * The top bar of the apps and the pages around them (AppFrame): ‹ Home on the
 * left (‹ Back on a friend's profile), then the app's name in an app; the
 * user's picture on the right, the way to Account (not on /account itself,
 * nor logged out). An app's tabs, when it has more than one, are in it too:
 * on a phone they are fixed along the bottom of the screen, within reach of a
 * thumb; on a wider screen, in the middle of the bar.
 */
export function TopBar({
  title,
  back = home,
  nav,
  username,
  name,
  avatarUrl,
  onAccount = false,
}: {
  /** The app's name; none on the pages around the apps, whose heading is just under it. */
  title?: string;
  back?: BackTarget;
  nav?: TabNavProps;
  /** Null when logged out: no Account. */
  username: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  /** On /account: no link to it. */
  onAccount?: boolean;
}) {
  return (
    <header className={shell.topBar}>
      <div className={shell.lead}>
        <BackLink back={back} />
        {title && <span className={shell.title}>{title}</span>}
      </div>
      {nav && nav.tabs.length > 1 && <TabBar {...nav} />}
      <div className={shell.trail}>
        {username && !onAccount && (
          // Named by hidden text, not aria-label: the initials it shows aren't its name.
          <Link href="/account" className={shell.account}>
            <Avatar username={username} name={name} url={avatarUrl} className={shell.navAvatar} />
            <span className={ui.srOnly}>Account</span>
          </Link>
        )}
      </div>
    </header>
  );
}
