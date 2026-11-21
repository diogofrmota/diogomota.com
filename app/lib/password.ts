import { compare, hash } from "bcryptjs";
import { testHooksEnabled } from "./test-hooks";

// About 250 ms per hash on the VPS: slow for guessing, fine for ~10 users.
// The e2e tests' server (test hooks on, which needs the runner's isolated
// database: lib/test-hooks.ts) uses bcrypt's minimum instead: a run signs up
// hundreds of accounts on one server, and the cost is not what they test.
const cost = () => (testHooksEnabled() ? 4 : 12);

export function hashPassword(password: string): Promise<string> {
  return hash(password, cost());
}

// Compared against when no account matches, so "no such account" takes as long
// as "wrong password" and response times don't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;

// `passwordHash` is null when no account matched; the result is then always false.
export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (passwordHash === null) {
    dummyHash ??= hash("no account has this password", cost());
    await compare(password, await dummyHash);
    return false;
  }
  return compare(password, passwordHash);
}
