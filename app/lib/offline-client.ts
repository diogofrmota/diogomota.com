import type { OfflineNotice } from "./offline-notice";
import { QueryClient, onlineManager, type Query, type Mutation } from "@tanstack/react-query";
import { persistQueryClient, persistQueryClientSave, type Persister } from "@tanstack/react-query-persist-client";
import { offlineFormat, offlineKey, offlinePersister } from "./offline-storage";
import { ApiError } from "./api-request";

export const offlineDehydrateOptions = {
  shouldDehydrateQuery: (query: Query) => query.meta?.persist === true && query.state.status === "success",
  shouldDehydrateMutation: (mutation: Mutation) => mutation.state.status === "pending",
};

/** Each tab owns a journal; abandoned journals can be replayed by another tab.
 * A lease is held through network completion, so a closing tab cannot race a
 * new owner. No copying or merging of pending operations is required. */
export function openOfflineClient(
  user: string,
  app: string,
  version: string,
  setup: ((client: QueryClient) => void) | undefined,
  opened: (owner: { client: QueryClient; persister: Persister }) => void,
  warn: (notice: OfflineNotice) => void,
  validSession: () => boolean,
  takeInitialClient?: () => QueryClient | undefined,
) {
  // v5 starts online=true and only observes future events. An offline document
  // reload must establish its current state before any restored mutation runs.
  onlineManager.setOnline(navigator.onLine);
  let disposed = false;
  let abandoned = false;
  let primary: QueryClient | undefined;
  const close = new Set<() => void>();
  const held = new Set<string>();
  let finished!: () => void;
  const completion = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const base = offlineKey(user, app);
  const preference = `diogomota-journal:${user}:${app}`;
  const slots = () => [
    "",
    ...Object.keys(localStorage)
      .filter((key) => key.startsWith(`${base}:tab:`) && key.endsWith(":pending"))
      .map((key) => key.slice(`${base}:tab:`.length, -":pending".length)),
  ];
  const pending = (slot: string) => {
    try {
      return (
        JSON.parse(localStorage.getItem(`${offlineKey(user, app, slot)}:pending`) ?? "null")?.mutations?.length > 0
      );
    } catch {
      warn({
        message: "An older offline journal needs recovery and has been retained unchanged.",
        offerRecovery: true,
      });
      return false;
    }
  };
  function claim(slot: string, main: boolean): Promise<boolean> {
    if (disposed || held.has(slot)) return Promise.resolve(false);
    held.add(slot);
    return new Promise((claimed) => {
      void navigator.locks
        .request(offlineKey(user, app, slot), { ifAvailable: true }, async (lock) => {
          if (!lock || disposed || !validSession()) {
            claimed(false);
            return;
          }
          let writable = true;
          let release!: () => void;
          const closed = new Promise<void>((resolve) => {
            release = resolve;
          });
          close.add(release);
          const client = (main ? takeInitialClient?.() : undefined) ?? new QueryClient();
          client.setDefaultOptions({
            queries: { retry: 1, refetchOnWindowFocus: true, gcTime: 7 * 86400_000 },
            mutations: { retry: (_count, error) => error instanceof ApiError && error.status === 0 },
          });
          setup?.(client);
          // Keep reconnect handling while an unmounted view drains a request
          // already in flight. The React provider may have unsubscribed.
          client.mount();
          const persister = offlinePersister(
            localStorage,
            user,
            app,
            version,
            (key) => !!client.getMutationDefaults(key).mutationFn,
            warn,
            () => writable && !abandoned && validSession(),
            slot,
          );
          const [unsubscribe, restored] = persistQueryClient({
            queryClient: client,
            persister,
            buster: offlineFormat,
            maxAge: Infinity,
            dehydrateOptions: offlineDehydrateOptions,
          });
          if (main) {
            primary = client;
            sessionStorage.setItem(preference, slot);
            await restored;
            if (disposed || !validSession()) claimed(false);
            else {
              opened({ client, persister });
              claimed(true);
              void client.resumePausedMutations();
            }
            await closed;
          } else {
            claimed(true);
            await Promise.race([
              closed,
              restored.then(async () => {
                if (disposed) return;
                let done!: () => void;
                const settled = new Promise<void>((resolve) => {
                  done = resolve;
                });
                const check = () => {
                  if (
                    !client
                      .getMutationCache()
                      .getAll()
                      .some((mutation) => mutation.state.status === "pending")
                  )
                    done();
                };
                const stopChecking = client.getMutationCache().subscribe(check);
                try {
                  check();
                  void client.resumePausedMutations();
                  // resumePausedMutations resolves immediately while offline.
                  // Keep ownership until operations really settle or we close.
                  await Promise.race([closed, settled]);
                } finally {
                  stopChecking();
                }
              }),
            ]).catch(() => {});
          }
          if (abandoned) void client.cancelQueries();
          else await client.cancelQueries();
          // Already-sent requests may still succeed after a view unmounts. Keep
          // the lease and persist their answers before allowing a replacement.
          while (!abandoned) {
            const inFlight = client
              .getMutationCache()
              .getAll()
              .filter((mutation) => mutation.state.status === "pending" && !mutation.state.isPaused);
            if (!inFlight.length) break;
            // Mutation.continue() resolves at the retryer/network boundary,
            // before async success callbacks and the final status dispatch.
            await new Promise<void>((resolve) => {
              const check = () => {
                if (inFlight.every((mutation) => mutation.state.status !== "pending" || mutation.state.isPaused)) {
                  unsubscribeSettled();
                  resolve();
                }
              };
              const unsubscribeSettled = client.getMutationCache().subscribe(check);
              check();
            });
          }
          if (!abandoned && validSession())
            await persistQueryClientSave({
              queryClient: client,
              persister,
              buster: offlineFormat,
              dehydrateOptions: offlineDehydrateOptions,
            });
          writable = false;
          client.unmount();
          unsubscribe();
          client.clear();
          close.delete(release);
          if (!main && !disposed) void primary?.invalidateQueries();
        })
        .catch(() => {
          claimed(false);
          warn({ message: "Offline storage could not start. Reload to try again." });
        })
        .finally(() => {
          held.delete(slot);
          if (disposed && held.size === 0) {
            window.removeEventListener("pagehide", hide);
            finished();
          }
        });
    });
  }
  async function scan() {
    if (disposed || !primary || !validSession()) return;
    for (const slot of slots()) if (!held.has(slot) && pending(slot)) await claim(slot, false);
  }
  void (async () => {
    const preferred = sessionStorage.getItem(preference);
    const candidates = [...new Set([...(preferred === null ? [] : [preferred]), ...slots()])];
    for (const slot of candidates)
      if (await claim(slot, true)) {
        await scan();
        return;
      }
    if (!disposed && (await claim(crypto.randomUUID(), true))) await scan();
  })().catch(() =>
    warn({
      message: "Offline storage is unavailable. Editing is paused to protect your changes.",
      pauseEditing: true,
      offerRecovery: true,
    }),
  );
  const changed = () => {
    void scan();
  };
  window.addEventListener("storage", changed);
  window.addEventListener("online", changed);
  const timer = setInterval(changed, 5000);
  const show = (event: PageTransitionEvent) => {
    if (event.persisted) window.location.reload();
  };
  const hide = () => {
    abandoned = true;
    primary?.unmount();
    dispose();
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  function dispose() {
    disposed = true;
    clearInterval(timer);
    window.removeEventListener("storage", changed);
    window.removeEventListener("online", changed);
    if (held.size === 0) window.removeEventListener("pagehide", hide);
    if (!abandoned) window.removeEventListener("pageshow", show);
    for (const release of close) release();
    if (held.size === 0) finished();
    return completion;
  }
  return dispose;
}
