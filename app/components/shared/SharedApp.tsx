"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/common/AppShell";
import type { User } from "@/lib/users";
import type { Space } from "@/lib/space-types";
import { spaceRequest } from "./space-request";
import { SpaceWelcome } from "./SpaceWelcome";
import { Calendar } from "./Calendar";
import { Tasks } from "./Tasks";

// Calendar and Tasks for the user's space, tabs on the left of the top bar, or
// before there is one, creating or joining one (and no tabs). The space's
// settings (its name, members, invites, leaving) are in Settings (/settings),
// from the account menu.
export function SharedApp({ user, initialSpace }: { user: User; initialSpace: Space | null }) {
  const [space, setSpace] = useState(initialSpace);
  // Set once a space is created or joined here, which the check below must not undo.
  const joined = useRef(false);
  // The page may be one the browser kept for Back, rendered before the space
  // changed (left or renamed in Settings): checked once shown, and
  // replaced if it did. A failed check keeps what's shown; the views say so
  // themselves if the space can't be reached.
  useEffect(() => {
    let active = true;
    spaceRequest<Space | null>().then((current) => {
      if (!active || joined.current) return;
      setSpace((shown) => JSON.stringify(shown) === JSON.stringify(current) ? shown : current);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  function onJoined(next: Space) {
    joined.current = true;
    setSpace(next);
  }
  return <AppShell key={space?.id ?? "welcome"} name="Shared" username={user.username} theme={user.themePreference}
    hideNavigation={!space} tabs={space ? [
      { id: "calendar", label: "Calendar", view: <Calendar space={space} userId={user.id} /> },
      { id: "tasks", label: "Tasks", view: <Tasks space={space} /> },
    ] : [{ id: "welcome", label: "Your space", view: <SpaceWelcome onJoined={onJoined} /> }]} />;
}
