"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/common/AppShell";
import { CompassIcon, LibraryIcon, UserIcon } from "@/components/common/icons";
import { QueryProvider } from "@/components/common/QueryProvider";
import { UndoToast } from "@/components/common/Undo";
import { FriendProfile } from "@/components/social/FriendProfile";
import { Profile } from "@/components/social/Profile";
import { useAppView } from "@/hooks/useAppView";
import type { AppViewState } from "@/lib/app-views";
import type { Theme } from "@/lib/themes";
import { BookActions } from "./BookActions";
import { BookDialog } from "./BookDialog";
import { BookForm } from "./BookForm";
import { ShelvesProvider, useShelves } from "./books-data";
import { Discover } from "./Discover";
import { Library } from "./Library";
import { SearchDialog } from "./SearchDialog";

const catalogIdPattern = /^OL\d+W$/;

// The panels, as Shows': search stays open under a book opened from it, and
// under Add a book yourself; the top one of the others shows. Their ids:
// "book:<id>", "work:OL…W", "actions:<id>", "new" and "edit:<id>".
function Panels() {
  const { panels, closePanel } = useAppView();
  const { undo } = useShelves();
  const top = panels.at(-1) ?? "";
  // "book:<id>" is the kind "book" and the id; "new" has no id.
  const [kind, id = ""] = top.split(/:(.*)/);
  return (
    <>
      {panels.includes("search") && <SearchDialog />}
      {kind === "book" && <BookDialog key={top} bookId={id} onClose={closePanel} />}
      {kind === "work" && catalogIdPattern.test(id) && <BookDialog key={top} catalogId={id} onClose={closePanel} />}
      {kind === "actions" && <BookActions key={top} id={id} />}
      {kind === "new" && <BookForm key={top} />}
      {kind === "edit" && <BookForm key={top} id={id} />}
      <UndoToast undo={undo} />
    </>
  );
}

// Library (Currently Reading, Want to Read, Finished), Discover and Profile,
// as tabs, as Shows'. The view and its open panels are in the URL:
// /books/discover?p=work:OL893414W.
export function BooksApp({
  user,
  theme,
  initial,
  version,
  profileId,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
  theme: Theme;
  initial: AppViewState;
  version: string;
  /** A friend's profile (/books/profile/id), in the app's frame. */
  profileId?: string;
}) {
  const tabs = useMemo(
    () => [
      { id: "library", label: "Library", icon: <LibraryIcon />, view: <Library /> },
      { id: "discover", label: "Discover", icon: <CompassIcon />, view: <Discover /> },
      {
        id: "profile",
        label: "Profile",
        icon: <UserIcon />,
        view: <Profile app="books" own username={user.username} />,
      },
    ],
    [user.username],
  );
  if (profileId)
    return (
      <FriendProfile
        app="books"
        name="Books"
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
    <QueryProvider app="books" userId={user.id} version={version}>
      <ShelvesProvider>
        <AppShell
          name="Books"
          basePath="/books"
          initial={initial}
          username={user.username}
          avatarUrl={user.avatarUrl}
          theme={theme}
          tabs={tabs}
        >
          <Panels />
        </AppShell>
      </ShelvesProvider>
    </QueryProvider>
  );
}
