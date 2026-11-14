import Link from "next/link";
import { logOut } from "@/app/account/actions";
import { LogoutButton } from "@/components/account/LogoutButton";
import { authHref } from "@/lib/next-path";
import { Avatar } from "./Avatar";
import { AppsIcon, LogoutIcon, UserIcon } from "./icons";
import { LinkPending } from "./LinkPending";

import type { TabNavProps } from "./AppShell";
import shell from "./AppShell.module.css";

export function AppsAccountTabs({
  username,
  avatarUrl,
  next,
}: {
  username: string | null;
  avatarUrl?: string | null;
  next?: string | null;
}) {
  return (
    <nav aria-label="Account" className={shell.bottomTabs}>
      <ul>
        {username ? (
          <>
            <li>
              <Link href="/account">
                <Avatar username={username} url={avatarUrl} className={shell.navAvatar} />
                Account
                <LinkPending />
              </Link>
            </li>
            <li>
              <form action={logOut}>
                <LogoutButton className="" icon={<LogoutIcon />} />
              </form>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link href={authHref("/login", next)}>
                <UserIcon />
                Log in
                <LinkPending />
              </Link>
            </li>
            <li>
              <Link href={authHref("/signup", next)}>
                <UserIcon />
                Sign up
                <LinkPending />
              </Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}

/** Bottom navigation at every width: each tab's icon over its name. */
export function BottomTabs({ label, tabs, current, onSelect }: TabNavProps) {
  return (
    <nav aria-label={label} className={shell.bottomTabs}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              aria-current={tab.id === current ? "page" : undefined}
              onClick={() => onSelect(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          </li>
        ))}
        <li>
          <Link href="/apps">
            <LinkPending icon={<AppsIcon />} />
            Apps
          </Link>
        </li>
      </ul>
    </nav>
  );
}
