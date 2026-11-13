"use server";

import { APIError } from "better-auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, getSession } from "@/auth";
import { checkPassword } from "@/lib/accounts";
import {
  emailError,
  formPassword,
  nameError,
  normalizeEmail,
  normalizeName,
  normalizeUsername,
  passwordError,
  usernameError,
} from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { appsWithNext } from "@/lib/next-path";
import { passwordCheckLimit, verifyEmailLimit } from "@/lib/rate-limit";
import { isTheme } from "@/lib/themes";
import { findUserById, updateName, updateThemePreference, updateUsername } from "@/lib/users";

// Actions are reachable by anyone who can send a POST, so each one checks the session.
async function currentUser() {
  const session = await getSession();
  if (!session) redirect(appsWithNext("/account"));
  return session.user;
}

const tooManyAttempts = "Too many attempts. Wait 15 minutes and try again.";

export async function changeUsername(_previous: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await currentUser();
  const username = normalizeUsername(formData.get("username"));
  const values = { username };

  const error = usernameError(username);
  if (error) return { fieldErrors: { username: error }, values };
  if (!(await updateUsername(userId, username))) {
    return { fieldErrors: { username: "That username is taken." }, values };
  }

  // The session reads the username from the database, so every page has the new one.
  revalidatePath("/", "layout");
  return { success: "Username changed.", values };
}

export async function changeName(_previous: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await currentUser();
  const name = normalizeName(formData.get("name"));
  const values = { name };

  const fieldErrors = { name: nameError(name) ?? undefined };
  if (fieldErrors.name) return { fieldErrors, values };

  await updateName(userId, name);
  // Shown on this page and in both apps.
  revalidatePath("/", "layout");
  return { success: "Name saved.", values };
}

// The email logs in and gets password resets, so changing it takes the current
// password (a session left open isn't enough to take the account), and only
// happens once the link sent to the new address is opened: nobody can put an
// address they don't own on their account.
export async function changeEmail(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  const email = normalizeEmail(formData.get("email"));
  const currentPassword = formPassword(formData.get("currentPassword"));
  const values = { email };

  const fieldErrors = {
    email: emailError(email) ?? undefined,
    currentPassword: currentPassword ? undefined : "Enter your current password.",
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors, values };

  if (!passwordCheckLimit(user.id)) return { error: tooManyAttempts, values };
  if (!(await checkPassword(user.id, currentPassword))) {
    return { fieldErrors: { currentPassword: "That isn't your current password." }, values };
  }
  const current = await findUserById(user.id);
  if (current?.email.toLowerCase() === email.toLowerCase()) {
    return { fieldErrors: { email: "That is already your email." }, values };
  }

  try {
    await auth.api.changeEmail({
      body: { newEmail: email, callbackURL: "/account?email=changed" },
      headers: await headers(),
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    console.error("Changing an email failed", error);
    return { error: "Couldn't change your email. Try again.", values };
  }
  // The same answer whether or not another account has it, so nobody can find out who has an account.
  return { success: `We sent a link to ${email}. Your email changes once you open it.`, values };
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
  if (!passwordCheckLimit(userId)) return { error: tooManyAttempts };
  if (!(await checkPassword(userId, currentPassword))) {
    return { fieldErrors: { currentPassword: "That isn't your current password." } };
  }

  const requestHeaders = await headers();
  await auth.api.changePassword({
    body: { currentPassword, newPassword, revokeOtherSessions: true },
    headers: requestHeaders,
  });
  // Every other device is logged out; this one too, by choice (plan.md). Logging
  // in with the new password comes back here.
  await auth.api.signOut({ headers: requestHeaders }).catch(() => {});
  redirect(`/login?${new URLSearchParams({ password: "changed", next: "/account" })}`);
}

export async function saveTheme(_previous: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await currentUser();
  const theme = formData.get("theme");
  if (!isTheme(theme)) return { error: "Choose a theme." };

  await updateThemePreference(userId, theme);
  // The browser keeps the pages it has shown for back and forward, each still in
  // the theme it was rendered with. This makes them render again when next shown.
  revalidatePath("/", "layout");
  return { success: "Theme saved.", values: { theme } };
}

/** Sends the link that confirms the user's email again (at most 3 an hour). */
export async function resendVerification(): Promise<FormState> {
  const user = await currentUser();
  if (user.emailVerified) return { success: "Your email is confirmed." };
  if (!verifyEmailLimit(user.id)) return { error: "You asked for a few links already. Try again in an hour." };
  const current = await findUserById(user.id);
  if (!current) redirect(appsWithNext("/account"));
  await auth.api.sendVerificationEmail({ body: { email: current.email, callbackURL: "/account?email=confirmed" } });
  return { success: `We sent a new link to ${current.email}.` };
}

/**
 * Deletes the account, after the password: it leaves its space first (auth.ts,
 * beforeDelete), and everything of theirs goes with it. Then back to /apps,
 * logged out, which says it's done.
 */
export async function deleteAccount(_previous: FormState, formData: FormData): Promise<FormState> {
  const { id: userId } = await currentUser();
  const password = formPassword(formData.get("password"));
  if (!password) return { fieldErrors: { password: "Enter your password." } };
  if (!passwordCheckLimit(userId)) return { error: tooManyAttempts };
  if (!(await checkPassword(userId, password))) return { fieldErrors: { password: "That isn't your password." } };

  await auth.api.deleteUser({ body: { password }, headers: await headers() });
  revalidatePath("/", "layout");
  redirect("/apps?account=deleted");
}

// Called once the profile picture has changed (set or removed) through
// /api/account/avatar. Like a new theme, it shows on every page (the account
// menu): this makes the pages the browser kept render again when next shown,
// and this one now. The change itself is in the API, which checks it.
export async function avatarChanged(): Promise<void> {
  if (!(await getSession())) return;
  revalidatePath("/", "layout");
}

export async function logOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() }).catch(() => {});
  redirect("/apps");
}
