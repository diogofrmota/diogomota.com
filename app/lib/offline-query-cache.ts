import type { PersistedClient } from "@tanstack/react-query-persist-client";

export type QuerySnapshot = PersistedClient & { version: string };
export interface OfflineQueryStore {
  get(key: string): Promise<QuerySnapshot | undefined>;
  put(key: string, value: QuerySnapshot, active: () => boolean): Promise<void>;
}
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diogomota-offline-queries-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Offline query storage is blocked"));
  }));
}
function finished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline transaction aborted"));
    transaction.onerror = () => reject(transaction.error);
  });
}
export function browserQueryStore(): OfflineQueryStore | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  return {
    async get(key) {
      const db = await database();
      const transaction = db.transaction("snapshots", "readonly");
      const request = transaction.objectStore("snapshots").get(key);
      await finished(transaction);
      return request.result;
    },
    async put(key, value, active) {
      const db = await database();
      if (!active()) return;
      const transaction = db.transaction("snapshots", "readwrite");
      transaction.objectStore("snapshots").put(value, key);
      await finished(transaction);
    },
  };
}
/** Clear in a transaction, without deleteDatabase's cross-tab open-connection race. */
export async function clearOfflineQueryCache() {
  if (typeof indexedDB === "undefined") return;
  const db = await database();
  const transaction = db.transaction("snapshots", "readwrite");
  transaction.objectStore("snapshots").clear();
  await finished(transaction);
}
