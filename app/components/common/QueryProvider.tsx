"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient, QueryClientProvider, defaultShouldDehydrateMutation, type Query } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState } from "react";

// What each app loads from its JSON API, and what it changes there, through
// TanStack Query (tanstack.com/query): one cache per page, which loads a query
// again when it is shown again and when the browser tab comes back into view.
//
// Offline (no connection, or the phone in a basement): the queries marked
// `meta: { persist: true }` (Shared's tasks, calendar and space, the Shows
// library) are kept in this browser, per user, so the app opens with them; and
// a change made meanwhile waits, kept too, and is sent once the connection is
// back, even after a reload (the change's function is the mutation's default,
// registered by `setup`). Logging out forgets them all (clearOfflineData).

const storageKey = (userId: string) => `diogomota-cache:${userId}`;
/** A week: older than that, what is kept is let go of. */
const maxAge = 7 * 24 * 60 * 60 * 1000;

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Forgets every user's kept data on this device (logging out, deleting the account). */
export function clearOfflineData() {
  const local = storage();
  if (local) {
    for (const key of Object.keys(local)) if (key.startsWith("diogomota-cache:")) local.removeItem(key);
  }
  if (typeof caches !== "undefined") void caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
}

export function QueryProvider({
  userId,
  version,
  setup,
  children,
}: {
  /** Whose data is kept: each user's on their own. */
  userId: string;
  /** The app's version (APP_VERSION): another version starts afresh, in case what is kept changed shape. */
  version: string;
  /** Registers the default function of each kind of change (queryClient.setMutationDefaults). */
  setup?: (client: QueryClient) => void;
  children: React.ReactNode;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, refetchOnWindowFocus: true, gcTime: maxAge, staleTime: 0 },
        mutations: { retry: 0 },
      },
    });
    setup?.(queryClient);
    return queryClient;
  });
  const [persister] = useState(() => {
    const local = storage();
    return local ? createSyncStoragePersister({ storage: local, key: storageKey(userId), throttleTime: 1000 }) : null;
  });

  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge,
        buster: version,
        dehydrateOptions: {
          shouldDehydrateQuery: (query: Query) => query.meta?.persist === true && query.state.status === "success",
          // Changes waiting for the connection.
          shouldDehydrateMutation: defaultShouldDehydrateMutation,
        },
      }}
      // Changes kept from before a reload go out now (each waits for the connection).
      onSuccess={() => void client.resumePausedMutations()}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
