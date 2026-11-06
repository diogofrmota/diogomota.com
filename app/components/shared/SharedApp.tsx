"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/common/AppShell";
import type { User } from "@/lib/users";
import type { Space } from "@/lib/space-types";
import { spaceRequest } from "./space-request";
import { SpaceWelcome } from "./SpaceWelcome";
import { SpaceSettings } from "./SpaceSettings";
import { Calendar } from "./Calendar";
import { Tasks } from "./Tasks";

// Calendar, Tasks and Settings (the space's name, members, invites, leaving)
// for the user's space, tabs in the middle of the top bar, or before there is
// one, creating or joining one (and no tabs).
export function SharedApp({ user, initialSpace }: { user: User; initialSpace: Space | null }) {
  const [space, setSpace] = useState(initialSpace);
  // Set once a space is created or joined here, which the check below must not undo.
  const joined = useRef(false);
  // The space as the server has it now. The one shown is kept if nothing
  // changed, so the views don't load again for nothing.
  const showSpace = useCallback((current: Space | null) => {
    setSpace((shown) => JSON.stringify(shown) === JSON.stringify(current) ? shown : current);
  }, []);
  // The page may be one the browser kept for Back, rendered before the space
  // changed (left or renamed): checked once shown, and replaced if it did. A
  // failed check keeps what's shown; the views say so themselves if the space
  // can't be reached.
  useEffect(() => {
    let active = true;
    spaceRequest<Space | null>().then((current) => {
      if (active && !joined.current) showSpace(current);
    }).catch(() => {});
    return () => { active = false; };
  }, [showSpace]);
  function onJoined(next: Space) {
    joined.current = true;
    setSpace(next);
  }
  return <AppShell key={space?.id ?? "welcome"} name="Shared" username={user.username} theme={user.themePreference}
    hideNavigation={!space} tabs={space ? [
      { id: "calendar", label: "Calendar", view: <Calendar space={space} userId={user.id} /> },
      { id: "tasks", label: "Tasks", view: <Tasks space={space} /> },
      { id: "settings", label: "Settings", view: <SpaceSettings space={space} userId={user.id} onChange={showSpace} /> },
    ] : [{ id: "welcome", label: "Your space", view: <SpaceWelcome onJoined={onJoined} /> }]} />;
}
