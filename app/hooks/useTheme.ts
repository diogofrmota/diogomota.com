"use client";

import { useRef, useState } from "react";
import { setThemePreference } from "@/app/account/actions";
import type { Theme } from "@/lib/users";

// The theme of Settings (/settings), where it is chosen for the apps
// (components/shows/ShowsSettings). It starts as the user's saved preference, which the
// server renders into the page, so the first paint is already in the right theme
// (nothing to correct after load). Each change is saved to the account; if that
// fails, the theme switches back.
export function useTheme(saved: Theme): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState(saved);
  // Only the newest change may switch back, so a slow failure can't undo a later one.
  const lastChange = useRef(0);

  function setTheme(next: Theme) {
    const previous = theme;
    const change = ++lastChange.current;
    setThemeState(next);
    const undo = () => {
      if (change === lastChange.current) setThemeState(previous);
    };
    setThemePreference(next).then((saved) => saved || undo(), undo);
  }

  return [theme, setTheme];
}
