"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Space } from "@/lib/space-types";
import { spaceQuery } from "./shared-data";

/**
 * The user's group (a space, in the code) on a page of For Couples (Calendar,
 * Tasks, the group's settings), inside its QueryProvider: the one the server
 * rendered, checked once shown, and the way to show another (`showSpace`: one
 * left, or with members who came or went) or the one just created or joined
 * (`onJoined`).
 */
export function useGroup(initialSpace: Space | null) {
  const [space, setSpace] = useState(initialSpace);
  // Set once a group is created or joined here, which the check below must not undo.
  const joined = useRef(false);
  // The group as the server has it now. The one shown is kept if nothing
  // changed, so the views don't load again for nothing.
  const showSpace = useCallback((current: Space | null) => {
    setSpace((shown) => (JSON.stringify(shown) === JSON.stringify(current) ? shown : current));
  }, []);
  // The page may be one the browser kept for Back, rendered before the group
  // changed (left, or members came or went): checked once shown (and kept in
  // this browser for offline use), and replaced if it did. A failed check keeps
  // what's shown; the views say so themselves if the group can't be reached.
  const checked = useQuery({ ...spaceQuery, initialData: initialSpace, initialDataUpdatedAt: 0 });
  // Once the check is done: isFetchedAfterMount alone is also set by restoring the group kept in this browser.
  useEffect(() => {
    if (!joined.current && checked.isFetchedAfterMount && !checked.isFetching) showSpace(checked.data ?? null);
  }, [checked.data, checked.isFetchedAfterMount, checked.isFetching, showSpace]);
  const client = useQueryClient();
  const onJoined = useCallback(
    (next: Space) => {
      joined.current = true;
      // What the views read is the group now, not the answer from before it.
      client.setQueryData(spaceQuery.queryKey, next);
      setSpace(next);
    },
    [client],
  );
  return { space, showSpace, onJoined, checked };
}
