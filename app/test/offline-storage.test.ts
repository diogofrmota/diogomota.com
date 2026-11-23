import { describe, it, expect, vi } from "vitest";
import { QueryClient, hydrate } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { offlineFormat, offlineKey, offlinePersister } from "../lib/offline-storage";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  } as Storage;
}
const mutation = (app: string, name = "change") => ({
  mutationKey: [app, name],
  state: { status: "pending", isPaused: true, variables: { id: "pending" } },
});
const snapshot = (...apps: string[]) =>
  ({
    timestamp: 1,
    buster: "old-release",
    clientState: { queries: [], mutations: apps.map((app) => mutation(app)) },
  }) as unknown as PersistedClient;

describe("durable offline snapshots", () => {
  it("keeps ancient pending operations over a patch release and cache expiry", async () => {
    const local = storage();
    const first = offlinePersister(local, "A", "fitness", "1", () => true, vi.fn());
    await first.persistClient(snapshot("fitness"));
    const restored = await offlinePersister(local, "A", "fitness", "2", () => true, vi.fn()).restoreClient();
    expect(restored?.buster).toBe(offlineFormat);
    expect(restored?.clientState.mutations).toHaveLength(1);
    expect(restored?.clientState.queries).toEqual([]);
  });
  it("retains unsupported queues unchanged despite TanStack removal and subsequent writes", async () => {
    const local = storage();
    const key = `${offlineKey("A", "shows")}:pending`;
    const original = JSON.stringify({ format: "future-v9", mutations: [mutation("shows")] });
    local.setItem(key, original);
    const warn = vi.fn();
    const p = offlinePersister(local, "A", "shows", "2", () => true, warn);
    await expect(p.restoreClient()).rejects.toThrow();
    await p.removeClient();
    await p.persistClient(snapshot());
    expect(local.getItem(key)).toBe(original);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ pauseEditing: true, offerRecovery: true }));
  });
  it("writes pending operations before large caches and reports quota failure", async () => {
    const local = storage();
    const warn = vi.fn();
    const original = local.setItem;
    local.setItem = (key, value) => {
      if (!key.endsWith(":pending")) throw new Error("QuotaExceededError");
      original(key, value);
    };
    await offlinePersister(local, "A", "fitness", "1", () => true, warn).persistClient(snapshot("fitness"));
    expect(local.getItem(`${offlineKey("A", "fitness")}:pending`)).toContain("pending");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Pending changes are still saved"),
        offerRecovery: true,
      }),
    );
    local.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    await offlinePersister(local, "A", "fitness", "1", () => true, warn).persistClient(snapshot("fitness"));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Keep this tab open"), offerRecovery: true }),
    );
  });
  it("does not recreate data after the session writer has stopped", async () => {
    const local = storage();
    await offlinePersister(
      local,
      "A",
      "fitness",
      "1",
      () => true,
      vi.fn(),
      () => false,
    ).persistClient(snapshot("fitness"));
    expect(local.getItem(`${offlineKey("A", "fitness")}:pending`)).toBeNull();
  });
  it("additional tab journals never overwrite the base queue", async () => {
    const local = storage();
    const warn = vi.fn();
    const base = offlinePersister(local, "A", "fitness", "1", () => true, warn);
    await base.persistClient(snapshot("fitness"));
    expect((await base.restoreClient())?.clientState.mutations).toHaveLength(1);
    const tab = offlinePersister(
      local,
      "A",
      "fitness",
      "1",
      () => true,
      warn,
      () => true,
      "another-tab",
    );
    expect((await tab.restoreClient())?.clientState.mutations).toHaveLength(0);
    await tab.persistClient(snapshot("fitness", "fitness"));
    expect((await base.restoreClient())?.clientState.mutations).toHaveLength(1);
    expect((await tab.restoreClient())?.clientState.mutations).toHaveLength(2);
  });
  it("commits the small pending journal before asynchronous query storage and survives query-storage failures", async () => {
    const local = storage();
    const warn = vi.fn();
    const queryStore = {
      get: async () => undefined,
      put: vi.fn(async () => {
        expect(local.getItem(`${offlineKey("A", "fitness")}:pending`)).toContain("pending");
        throw new DOMException("Quota full", "QuotaExceededError");
      }),
    };
    const persister = offlinePersister(
      local,
      "A",
      "fitness",
      "1",
      () => true,
      warn,
      () => true,
      "",
      queryStore,
    );
    await persister.persistClient(snapshot("fitness"));
    expect(queryStore.put).toHaveBeenCalled();
    expect((await persister.restoreClient())?.clientState.mutations).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Pending changes are still saved"),
        offerRecovery: true,
      }),
    );
  });

  it("restores an uncertain in-flight delivery as paused so TanStack actually resumes it", async () => {
    const local = storage();
    const value = snapshot("fitness");
    value.clientState.mutations[0].state.isPaused = false;
    const persister = offlinePersister(local, "A", "fitness", "1", () => true, vi.fn());
    await persister.persistClient(value);
    const client = new QueryClient();
    const deliver = vi.fn(async () => ({ saved: true }));
    client.setMutationDefaults(["fitness", "change"], { mutationFn: deliver });
    hydrate(client, (await persister.restoreClient())!.clientState);
    await client.resumePausedMutations();
    expect(deliver).toHaveBeenCalledExactlyOnceWith(
      { id: "pending" },
      expect.objectContaining({ client, mutationKey: ["fitness", "change"] }),
    );
    expect(client.getMutationCache().getAll()[0].state.status).toBe("success");
    client.clear();
  });
});
