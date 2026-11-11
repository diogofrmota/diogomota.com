"use client";
import { AppShell } from "@/components/common/AppShell";
import { useAppView } from "@/hooks/useAppView";
import { parseTitleKey } from "@/lib/show-types";
import type { Theme } from "@/lib/themes";
import { Discover } from "./Discover";
import { FriendDialog } from "./FriendDialog";
import { Home } from "./Home";
import { LibraryProvider } from "./library";
import { Profile } from "./Profile";
import { QuickActions } from "./QuickActions";
import { SearchDialog } from "./SearchDialog";
import { TitleDialog } from "./TitleDialog";

// The search panel (opened from Discover's search field and an empty Home) and
// a friend's profile stay open under a title opened from them.
function Panels() {
  const { panels, closePanel } = useAppView();
  const top = panels.at(-1);
  const title = top?.startsWith("title:") ? parseTitleKey(top.slice(6)) : null;
  const actions = top?.startsWith("actions:") ? parseTitleKey(top.slice(8)) : null;
  const friend = panels.find((panel) => panel.startsWith("friend:"))?.slice(7);
  return <>
    {panels.includes("search") && <SearchDialog />}
    {friend && <FriendDialog key={friend} id={friend} />}
    {title && <TitleDialog key={top} title={title} onClose={closePanel} />}
    {actions && <QuickActions key={top} title={actions} />}
  </>;
}

export function ShowsApp({ username, avatarUrl, theme }: { username: string; avatarUrl: string | null; theme: Theme }) {
  return <LibraryProvider>
    <AppShell name="Shows" username={username} avatarUrl={avatarUrl} theme={theme} tabs={[
      { id: "home", label: "Home", view: <Home username={username} /> },
      { id: "discover", label: "Discover", view: <Discover /> },
      { id: "profile", label: "Profile", view: <Profile username={username} avatarUrl={avatarUrl} /> },
    ]}>
      <Panels />
    </AppShell>
  </LibraryProvider>;
}
