"use client";

import { QueryClient, QueryClientProvider, IsRestoringProvider, MutationCache, dehydrate } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { OfflineNotice } from "@/lib/offline-notice";
import { offlinePersister } from "@/lib/offline-storage";

import { openOfflineClient } from "@/lib/offline-client";
import { clearOfflineQueryCache } from "@/lib/offline-query-cache";

const transitionKey = "diogomota-session-transition";
const stopWriters = new Set<() => void>();
let clientSequence = 0;

function recoveryCopy(userId: string, client?: QueryClient) {
  const prefix = `diogomota-cache:${userId}`;
  const entries = Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key === prefix || key.startsWith(`${prefix}:`))
      .map((key) => [key, localStorage.getItem(key)]),
  );
  const contents = {
    format: "diogomota-recovery-v1",
    userId,
    savedAt: new Date().toISOString(),
    entries,
    live: client
      ? dehydrate(client, {
          shouldDehydrateQuery: () => false,
          shouldDehydrateMutation: (mutation) =>
            mutation.state.status === "pending" || mutation.state.status === "error",
        })
      : undefined,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "diogomota-pending-changes.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Await successful local session transitions before navigating away. */
export async function clearOfflineData(preservePending = false) {
  for (const stop of stopWriters) stop();
  localStorage.setItem(transitionKey, crypto.randomUUID());
  for (const key of Object.keys(localStorage))
    if (!preservePending && key.startsWith("diogomota-cache:")) localStorage.removeItem(key);
  await clearOfflineQueryCache();
  if ("serviceWorker" in navigator) {
    let registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      // The first fixed release can still be controlled by the old worker,
      // which has no cleanup message handler. Activate the current script
      // before asking it to acknowledge and drain account cache writes.
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await registration.update();
      const installing = registration.installing ?? registration.waiting;
      if (installing && installing.state !== "activated")
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Worker activation timed out")), 10000);
          installing.addEventListener("statechange", () => {
            if (installing.state === "activated") {
              clearTimeout(timeout);
              resolve();
            }
            if (installing.state === "redundant") {
              clearTimeout(timeout);
              reject(new Error("Worker activation failed"));
            }
          });
        });
    }
    const worker = registration?.active;
    if (worker)
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          channel.port1.close();
          reject(new Error("Worker cleanup timed out"));
        }, 10000);
        channel.port1.onmessage = () => {
          clearTimeout(timeout);
          channel.port1.close();
          resolve();
        };
        worker.postMessage({ type: "CLEAR_ACCOUNT" }, [channel.port2]);
      });
  }
  if (typeof caches !== "undefined")
    await Promise.all(
      (await caches.keys()).filter((key) => key.startsWith("diogomota-")).map((key) => caches.delete(key)),
    );
}

export function QueryProvider({
  userId,
  app,
  version,
  setup,
  children,
}: {
  userId: string;
  app: string;
  version: string;
  setup?: (client: QueryClient) => void;
  children: React.ReactNode;
}) {
  const handoff = useRef<Promise<void>>(Promise.resolve());
  // Preserve the server-rendered shell/theme before scripts or storage leases
  // are ready. Until ownership, it cannot fetch, persist or accept mutations.
  const [{ client: preview, setEditable }] = useState(() => {
    let editable = false;
    const client = new QueryClient({
      mutationCache: new MutationCache({
        onMutate: () => {
          if (!editable) throw new Error("Offline storage is opening. Try your change again in a moment.");
        },
      }),
    });
    setup?.(client);
    return {
      client,
      setEditable: (value: boolean) => {
        editable = value;
      },
    };
  });
  const [owner, setOwner] = useState<{
    id: number;
    client: QueryClient;
    persister?: ReturnType<typeof offlinePersister>;
  }>();
  const [notice, setNotice] = useState<OfflineNotice>();
  const [stopped, setStopped] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setEditable(false);
    let active = true;
    let visible = true;
    let dispose: (() => void | Promise<void>) | undefined;
    queueMicrotask(() => {
      if (visible) setReady(false);
    });
    let generation: string | null = null;
    let canPersist = !!navigator.locks;
    try {
      generation = localStorage.getItem(transitionKey);
    } catch {
      canPersist = false;
    }
    const stop = () => {
      active = false;
      setStopped(true);
      dispose?.();
    };
    stopWriters.add(stop);
    const transition = (event: StorageEvent) => {
      if (event.key === transitionKey) {
        stop();
        window.location.replace("/login");
      }
    };
    window.addEventListener("storage", transition);
    void handoff.current.then(() => {
      if (!visible || !active) return;
      if (!canPersist) {
        // Preserve connected use in older browsers and LAN development, where
        // Web Locks may be unavailable. Never hydrate or overwrite their queues.
        const client = new QueryClient({
          mutationCache: new MutationCache({
            onMutate: () => {
              if (!navigator.onLine)
                throw new Error("Reconnect before changing data: offline saving is unavailable in this browser.");
            },
          }),
          defaultOptions: { mutations: { networkMode: "always", retry: 0 } },
        });
        setup?.(client);
        dispose = () => client.clear();
        queueMicrotask(() => {
          if (!visible || !active) return;
          setEditable(true);
          setReady(true);
          setOwner({ id: ++clientSequence, client });
          setNotice({
            message:
              "Offline saving is unavailable in this browser. Changes require a connection; existing pending changes have been retained.",
          });
        });
      } else {
        dispose = openOfflineClient(
          userId,
          app,
          version,
          setup,
          (value) => {
            setEditable(true);
            setReady(true);
            setOwner({ ...value, id: value.client === preview ? 0 : ++clientSequence });
          },
          setNotice,
          () => active && localStorage.getItem(transitionKey) === generation,
          () => preview,
        );
      }
    });
    return () => {
      visible = false;
      setEditable(false);
      if (dispose) handoff.current = Promise.resolve(dispose());
      stopWriters.delete(stop);
      window.removeEventListener("storage", transition);
    };
  }, [userId, app, version, setup, preview, setEditable]);

  if (stopped) return <p role="status">Session ended. Clearing this device&apos;s data…</p>;
  if (notice?.pauseEditing)
    return (
      <main>
        <p role="alert">{notice.message}</p>
        <button type="button" onClick={() => recoveryCopy(userId, owner?.client)}>
          Download pending changes
        </button>
      </main>
    );
  return (
    <>
      {notice && <p role="alert">{notice.message}</p>}
      {notice?.offerRecovery && (
        <button type="button" onClick={() => recoveryCopy(userId, owner?.client)}>
          Download pending changes
        </button>
      )}
      <QueryClientProvider key={owner?.id ?? 0} client={owner?.client ?? preview}>
        <IsRestoringProvider value={!ready}>
          <fieldset disabled={!ready} style={{ display: "contents" }}>
            {children}
          </fieldset>
        </IsRestoringProvider>
      </QueryClientProvider>
    </>
  );
}
