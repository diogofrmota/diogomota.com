"use client";
import { AppShell } from "@/components/common/AppShell";
import { CompassIcon, LibraryIcon, UserIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import { useAppView } from "@/hooks/useAppView";
import type { AppViewState } from "@/lib/app-views";
import type { Named } from "@/lib/names";
import { parseTitleKey, titleKey } from "@/lib/show-types";
import type { Theme } from "@/lib/themes";
import { FriendProfile } from "@/components/social/FriendProfile";
import { Profile } from "@/components/social/Profile";
import { Discover } from "./Discover";
import { LibraryProvider, setupShows } from "./library";
import { QuickActions } from "./QuickActions";
import { SearchDialog } from "./SearchDialog";
import { TitleDialog } from "./TitleDialog";
import { Watchlist } from "./Watchlist";

// The search panel (opened from Discover's search field and an empty Library) and
// a friend's profile stay open under a title opened from them.
function Panels() {
  const { panels, closePanel } = useAppView();
  const top = panels.at(-1);
  const title = top?.startsWith("title:") ? parseTitleKey(top.slice(6)) : null;
  const actions = top?.startsWith("actions:") ? parseTitleKey(top.slice(8)) : null;
  return (
    <>
      {panels.includes("search") && <SearchDialog />}
      {title && <TitleDialog key={top} title={title} onClose={closePanel} />}
      {actions && <QuickActions key={top} title={actions} />}
    </>
  );
}

// Your profile, whose titles open their panel here, as the rest of Shows does.
function MyProfile({ username }: { username: string }) {
  const { openPanel } = useAppView();
  return <Profile app="shows" own username={username} onOpenTitle={(title) => openPanel(`title:${titleKey(title)}`)} />;
}

// Library (what you're watching, planned and completed) and Discover,
// as tabs. The view and its open panels are in the URL: /shows/discover?p=title:tv:1396.
export function ShowsApp({
  user,
  theme,
  initial,
  version,
  profileId,
}: {
  user: Named & { id: string; avatarUrl: string | null };
  theme: Theme;
  initial: AppViewState;
  version: string;
  /** A friend's profile (/shows/profile/id), in the app's frame. */
  profileId?: string;
}) {
  if (profileId)
    return (
      <FriendProfile
        app="shows"
        name="Shows"
        tabs={[
          { id: "library", label: "Library", icon: <LibraryIcon /> },
          { id: "discover", label: "Discover", icon: <CompassIcon /> },
          { id: "profile", label: "Profile", icon: <UserIcon /> },
        ]}
        user={user}
        theme={theme}
        profileId={profileId}
      />
    );
  return (
    <QueryProvider userId={user.id} version={version} setup={setupShows}>
      <LibraryProvider>
        <AppShell
          name="Shows"
          basePath="/shows"
          initial={initial}
          username={user.username}
          avatarUrl={user.avatarUrl}
          theme={theme}
          tabs={[
            { id: "library", label: "Library", icon: <LibraryIcon />, view: <Watchlist /> },
            { id: "discover", label: "Discover", icon: <CompassIcon />, view: <Discover /> },
            {
              id: "profile",
              label: "Profile",
              icon: <UserIcon />,
              view: <MyProfile username={user.username} />,
            },
          ]}
        >
          <Panels />
        </AppShell>
      </LibraryProvider>
    </QueryProvider>
  );
}
