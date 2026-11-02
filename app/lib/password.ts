import { compare, hash } from "bcryptjs";

// About 250 ms per hash on the VPS: slow for guessing, fine for ~10 users.
const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, COST);
}

// Compared against when no account matches, so "no such account" takes as long
// as "wrong password" and response times don't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;

// `passwordHash` is null when no account matched; the result is then always false.
export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (passwordHash === null) {
    dummyHash ??= hash("no account has this password", COST);
    await compare(password, await dummyHash);
    return false;
  }
  return compare(password, passwordHash);
}
