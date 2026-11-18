import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { applyTaskFields, type TaskList } from "./task-types";
import { browserQueryStore, type OfflineQueryStore } from "./offline-query-cache";

export const offlineFormat = "operations-v1";
export const offlineKey = (user: string, app: string, slot = "") =>
  `diogomota-cache:${user}:${app}:v1${slot ? `:tab:${slot}` : ""}`;
const week = 7 * 86400_000;

/** Caller holds the app's exclusive Web Lock. Never remove an unreadable queue. */
export function offlinePersister(
  storage: Storage,
  user: string,
  app: string,
  version: string,
  supported: (key: readonly unknown[]) => boolean,
  warn: (message: string) => void,
  active: () => boolean = () => true,
  slot = "",
  queryStore: OfflineQueryStore | undefined = browserQueryStore(),
): Persister {
  const key = offlineKey(user, app, slot);
  let blocked = false;
  const save = async (value: PersistedClient) => {
    if (!active() || blocked) return false;
    try {
      // Pending operations are written separately and first: a large disposable
      // query cache must never consume their quota or replace them on failure.
      storage.setItem(
        `${key}:pending`,
        JSON.stringify({ format: offlineFormat, mutations: value.clientState.mutations }),
      );
      try {
        const snapshot = { ...value, version, clientState: { ...value.clientState, mutations: [] } };
        if (queryStore) {
          await queryStore.put(key, snapshot, active);
          if (active()) storage.removeItem(key);
        } else storage.setItem(key, JSON.stringify(snapshot));
      } catch {
        warn("Offline views could not be saved. Pending changes are still saved on this device.");
      }
      return true;
    } catch {
      warn("Changes could not be saved on this device. Keep this tab open and reconnect before leaving.");
      return false;
    }
  };
  return {
    persistClient: async (value) => {
      await save(value);
    },
    restoreClient: async () => {
      try {
        const pending = storage.getItem(`${key}:pending`);
        const raw = storage.getItem(key);
        // Only the base journal owns migration. Additional tabs must never
        // independently import and replay the same legacy operation.
        const legacy = slot ? null : storage.getItem(`diogomota-cache:${user}`);
        const fallback = !raw && slot ? storage.getItem(offlineKey(user, app)) : null;
        let cached;
        try {
          cached = (await queryStore?.get(key)) ?? (slot ? await queryStore?.get(offlineKey(user, app)) : undefined);
        } catch {
          warn("Offline views could not be loaded. Pending changes are still retained.");
        }
        cached ??= raw ? JSON.parse(raw) : fallback ? JSON.parse(fallback) : undefined;
        let mutations: PersistedClient["clientState"]["mutations"] = [];
        if (pending) {
          const journal = JSON.parse(pending);
          if (journal.format !== offlineFormat || !Array.isArray(journal.mutations))
            throw new Error("Unsupported queue");
          mutations = journal.mutations;
        } else if (legacy) {
          const old: PersistedClient = JSON.parse(legacy);
          if (!Array.isArray(old.clientState?.mutations)) throw new Error("Unreadable legacy queue");
          mutations = old.clientState.mutations.filter((m) => m.mutationKey?.[0] === app);
          if (app === "shared") {
            const lists = structuredClone(
              old.clientState.queries.find((q) => q.queryKey[0] === "shared" && q.queryKey[1] === "tasks")?.state
                .data ?? [],
            ) as TaskList[];
            for (const mutation of mutations) {
              const change = mutation.state.variables as {
                kind?: string;
                id?: string;
                fields?: { isComplete?: boolean; expectedDueDate?: string | null };
                today?: string;
              };
              if (change.kind !== "updateTask" || !change.fields) continue;
              const task = lists.flatMap((list) => list.tasks).find((task) => task.id === change.id);
              if (change.fields.isComplete && change.fields.expectedDueDate === undefined) {
                // The previous cache contains the state before pending changes.
                // Without it, completion cannot safely identify an occurrence.
                if (!task) throw new Error("Legacy completion requires recovery");
                if (task.repeat) change.fields.expectedDueDate = task.dueDate;
              }
              if (task && change.today) Object.assign(task, applyTaskFields(task, change.fields, change.today));
            }
          }
          if (
            old.clientState.mutations.some(
              (m) => !["shared", "shows", "recipes", "fitness", "books"].includes(String(m.mutationKey?.[0])),
            )
          )
            warn("Some older pending changes need recovery. Their original offline snapshot has been retained.");
        }
        if (mutations.some((m) => !m.mutationKey || !supported(m.mutationKey)))
          throw new Error("Unsupported operation");
        // A request in flight when its document closed has no retryer after
        // hydration. TanStack resumes only isPaused mutations, so every saved
        // pending operation must be restored as paused, including uncertain
        // deliveries saved just before an offline event arrived.
        if (mutations.some((mutation) => mutation.state?.status !== "pending"))
          throw new Error("Unsupported operation state");
        mutations = mutations.map((mutation) => ({ ...mutation, state: { ...mutation.state, isPaused: true } }));
        const value: PersistedClient = {
          timestamp: Date.now(),
          buster: offlineFormat,
          clientState: {
            mutations,
            queries:
              cached?.version === version && Date.now() - cached.timestamp <= week ? cached.clientState.queries : [],
          },
        };
        // The empty journal is also a migration marker; never reimport a
        // completed legacy operation. Keep the original for rollback/recovery.
        if (!(await save(value))) throw new Error("Could not commit queue migration");
        return value;
      } catch {
        blocked = true;
        warn("The offline queue needs recovery. It has been retained unchanged; editing is paused to protect it.");
        throw new Error("Offline queue requires recovery");
      }
    },
    // TanStack calls this on restore errors/buster mismatches. Pending work
    // must survive even an unsupported future format or a malformed snapshot.
    removeClient: () => {},
  };
}
