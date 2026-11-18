import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ id: "" }));
vi.mock("@/auth", () => ({ getSession: async () => ({ user: { id: session.id } }) }));
import { getPool } from "../lib/db";
import { createSpace, createInvite, joinSpace, leaveSpace, inSpace } from "../lib/spaces";
import { createEvent } from "../lib/events";
import { calendarFeed, feedCalendar } from "../lib/calendar-feeds";
import { GET } from "../app/api/account/export/route";
import { assertTestIsolation } from "../e2e/isolation";

assertTestIsolation();
afterEach(() => vi.restoreAllMocks());
afterAll(() => getPool().end());
async function user() {
  const id = randomUUID();
  await getPool().query("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", [
    id,
    `test_${id.replaceAll("-", "").slice(0, 12)}`,
    `${id}@example.test`,
  ]);
  return id;
}

for (const kind of ["export", "feed"] as const)
  it(`${kind} excludes events created after membership departure`, async () => {
    const owner = await user();
    const reader = await user();
    session.id = reader;
    const space = await createSpace(owner);
    const invite = await createInvite(owner, space.id);
    await joinSpace(reader, invite.code);
    const token = new URL((await calendarFeed(reader)).url).pathname.split("/").at(-1)!;
    let release!: () => void;
    let paused!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      paused = resolve;
    });
    const original = pg.Client.prototype.query;
    let membershipRead = false;
    let intercepted = false;
    // Pause the real code exactly at its old authorization/data boundary.
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: pg.Client, ...args: unknown[]) {
      const sql = String(args[0]);
      const result = Reflect.apply(original, this, args);
      if (sql.includes("SELECT space_id FROM users") && (args[1] as unknown[])?.[0] === reader) membershipRead = true;
      const target =
        kind === "feed" ? sql.includes('SELECT u.space_id AS "spaceId"') : membershipRead && sql === "COMMIT";
      if (target && !intercepted) {
        intercepted = true;
        return Promise.resolve(result).then(async (value) => {
          paused();
          await barrier;
          return value;
        });
      }
      return result;
    } as typeof original);
    const response = kind === "feed" ? feedCalendar(token) : GET().then((r) => r.text());
    await ready;
    let departed = false;
    const departure = leaveSpace(reader, space.id).then(() => {
      departed = true;
    });
    const laterEvent = () =>
      inSpace(owner, (db, s) =>
        createEvent(db, s, owner, {
          title: "POST_REVOCATION_SECRET",
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3600000).toISOString(),
          allDay: false,
          isGroup: true,
          assigneeIds: [],
        }),
      );
    await Promise.race([departure, new Promise((resolve) => setTimeout(resolve, 150))]);
    if (departed) {
      await laterEvent();
      release();
    } else {
      release();
      await response;
      await departure;
      await laterEvent();
    }
    const body = await response;
    expect(body).not.toContain("POST_REVOCATION_SECRET");
  });
