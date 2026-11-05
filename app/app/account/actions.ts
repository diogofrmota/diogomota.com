"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut, unstable_update } from "@/auth";
import { formPassword, normalizeUsername, passwordError, usernameError } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { appsWithNext } from "@/lib/next-path";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordCheckLimit } from "@/lib/rate-limit";
import {
  getPasswordHash,
  type Theme,
  updatePasswordHash,
  updateThemePreference,
  updateUsername,
} from "@/lib/users";

// Actions are reachable by anyone who can send a POST, so each one checks the session.
async function currentUser(): Promise<{ id: string; username: string }> {
  const session = await auth();
  if (!session) redirect(appsWithNext("/account"));
  return session.user;
}

export async function changeUsername(_previous: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await currentUser();
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
  const { id: userId } = await currentUser();
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
  // That ended every session of the account (app/auth.ts): other devices, and
  // this one too. Logging in with the new password comes back here.
  await signOut({ redirectTo: `/login?${new URLSearchParams({ password: "changed", next: "/account" })}` });
  return {};
}

export async function saveTheme(_previous: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await currentUser();
  const theme = formData.get("theme");
  if (theme !== "light" && theme !== "dark") return { error: "Choose light or dark." };

  await saveThemePreference(userId, theme);
  return { success: "Theme saved.", values: { theme } };
}

// The theme picked in Global Settings (hooks/useTheme.ts). Returns whether it
// was saved; without a session it isn't, and the theme switches back.
export async function setThemePreference(theme: Theme): Promise<boolean> {
  const session = await auth();
  if (!session || (theme !== "light" && theme !== "dark")) return false;

  await saveThemePreference(session.user.id, theme);
  return true;
}

async function saveThemePreference(userId: string, theme: Theme): Promise<void> {
  await updateThemePreference(userId, theme);
  // The browser keeps the pages it has shown for back and forward, each still in
  // the theme it was rendered with. This makes them render again when next shown.
  revalidatePath("/", "layout");
}

export async function logOut(): Promise<void> {
  await signOut({ redirectTo: "/apps" });
}
