import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const cookieName = "diogomota-device-transition";

/** Only successful authentication actions may authorize local queue cleanup. */
export async function grantSessionTransition(destination: string, preservePending = false) {
  const key = randomBytes(24).toString("hex");
  (await cookies()).set(cookieName, `${preservePending ? "views" : "clear"}:${key}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
    path: "/session-transition",
    maxAge: 86400,
  });
  return `/session-transition?${new URLSearchParams({ next: destination, key })}`;
}

export async function sessionTransitionMode(key: unknown): Promise<"views" | "clear" | null> {
  if (typeof key !== "string" || !/^[a-f0-9]{48}$/.test(key)) return null;
  const value = (await cookies()).get(cookieName)?.value;
  if (value === `views:${key}`) return "views";
  if (value === `clear:${key}`) return "clear";
  return null;
}
