"use client";
import { AppShell } from "@/components/common/AppShell";
import { DiscoverIcon, HomeIcon, ProfileIcon, SearchIcon } from "@/components/common/icons";
import { PlaceholderView } from "@/components/common/PlaceholderView";
import { useAppView } from "@/hooks/useAppView";
import { parseTitleKey } from "@/lib/show-types";
import type { Theme } from "@/lib/users";
import { Discover } from "./Discover";
import { Home } from "./Home";
import { LibraryProvider } from "./library";
import { QuickActions } from "./QuickActions";
import { SearchDialog } from "./SearchDialog";
import { TitleDialog } from "./TitleDialog";
import styles from "./Shows.module.css";

// In the top bar of every view.
function SearchButton() {
  const { openPanel } = useAppView();
  return <button type="button" className={styles.searchButton} aria-label="Search" title="Search TV shows and movies"
    onClick={() => openPanel("search")}><SearchIcon /></button>;
}

// The search panel stays open under a title opened from it.
function Panels() {
  const { panels, closePanel } = useAppView();
  const top = panels.at(-1);
  const title = top?.startsWith("title:") ? parseTitleKey(top.slice(6)) : null;
  const actions = top?.startsWith("actions:") ? parseTitleKey(top.slice(8)) : null;
  return <>
    {panels.includes("search") && <SearchDialog />}
    {title && <TitleDialog key={top} title={title} onClose={closePanel} />}
    {actions && <QuickActions key={top} title={actions} />}
  </>;
}

export function ShowsApp({ username, theme }: { username: string; theme: Theme }) {
  return <LibraryProvider>
    <AppShell name="Shows" username={username} theme={theme} actions={<SearchButton />} tabs={[
      { id: "home", label: "Home", icon: <HomeIcon />, view: <Home /> },
      { id: "discover", label: "Discover", icon: <DiscoverIcon />, view: <Discover /> },
      { id: "profile", label: "Profile", icon: <ProfileIcon />,
        view: <PlaceholderView title="Profile" description="Your favourites, your stats and your friends." /> },
    ]}>
      <Panels />
    </AppShell>
  </LibraryProvider>;
}
