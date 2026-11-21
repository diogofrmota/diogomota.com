"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { FormState } from "@/lib/form-state";
import { safeNextPath } from "@/lib/next-path";
import { grantSessionTransition } from "@/lib/session-transition";
import { clientIp, loginLimit } from "@/lib/rate-limit";

// Logs in with a username or an email (in any case), and the password. With
// Remember me (`remember`, on to start with) the session lasts 30 days (auth.ts);
// without it, its cookie ends when the browser closes, and the session within a
// day (Better Auth's rememberMe: false).
export async function logIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const login = formData.get("login");
  const password = formData.get("password");
  const rememberMe = formData.get("remember") === "on";
  const values = { login: typeof login === "string" ? login : "", remember: rememberMe ? "yes" : "no" };
  const name = values.login.trim();
  if (!name || typeof password !== "string" || !password) {
    return { error: "Enter your username or email, and your password.", values };
  }

  const requestHeaders = await headers();
  if (!loginLimit(clientIp(requestHeaders))) {
    return { error: "Too many login attempts. Wait 15 minutes and try again.", values };
  }
  try {
    // Usernames can't contain "@", so one never matches a username and another account's email.
    if (name.includes("@"))
      await auth.api.signInEmail({ body: { email: name, password, rememberMe }, headers: requestHeaders });
    else await auth.api.signInUsername({ body: { username: name, password, rememberMe }, headers: requestHeaders });
  } catch (error) {
    // One message for an unknown account and a wrong password.
    if (error instanceof APIError) return { error: "Wrong username/email or password.", values };
    throw error;
  }
  redirect(await grantSessionTransition(safeNextPath(formData.get("next")) ?? "/", true));
}
