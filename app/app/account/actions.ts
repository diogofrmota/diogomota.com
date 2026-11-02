"use server";

import { redirect } from "next/navigation";
import { auth, signOut, unstable_update } from "@/auth";
import { formPassword, normalizeUsername, passwordError, usernameError } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { appsWithNext } from "@/lib/next-path";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordCheckLimit } from "@/lib/rate-limit";
import {
  getPasswordHash,
  updatePasswordHash,
  updateThemePreference,
  updateUsername,
} from "@/lib/users";

// Actions are reachable by anyone who can send a POST, so each one checks the session.
async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session) redirect(appsWithNext("/account"));
  return session.user.id;
}

export async function changeUsername(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = await currentUserId();
  const username = normalizeUsername(formData.get("username"));
  const values = { username };

  const error = usernameError(username);
  if (error) return { fieldErrors: { username: error }, values };
  if (!(await updateUsername(userId, username))) {
    return { fieldErrors: { username: "That username is taken." }, values };
  }

  // Re-issues the session cookie with the new username (read from the database
  // in the jwt callback). Setting the cookie also re-renders the page.
  await unstable_update({});
  return { success: "Username changed.", values };
}

export async function changePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = await currentUserId();
  const currentPassword = formPassword(formData.get("currentPassword"));
  const newPassword = formPassword(formData.get("newPassword"));
  const confirmPassword = formPassword(formData.get("confirmPassword"));

  const fieldErrors = {
    currentPassword: currentPassword ? undefined : "Enter your current password.",
    newPassword: passwordError(newPassword) ?? undefined,
    confirmPassword: confirmPassword === newPassword ? undefined : "The new passwords don't match.",
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors };

  // A stolen session shouldn't be a way to guess the password.
  if (!passwordCheckLimit(userId)) {
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }
  if (!(await verifyPassword(currentPassword, await getPasswordHash(userId)))) {
    return { fieldErrors: { currentPassword: "That isn't your current password." } };
  }

  await updatePasswordHash(userId, await hashPassword(newPassword));
  return { success: "Password changed." };
}

export async function saveTheme(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = await currentUserId();
  const theme = formData.get("theme");
  if (theme !== "light" && theme !== "dark") return { error: "Choose light or dark." };

  await updateThemePreference(userId, theme);
  return { success: "Theme saved.", values: { theme } };
}

export async function logOut(): Promise<void> {
  await signOut({ redirectTo: "/apps" });
}
