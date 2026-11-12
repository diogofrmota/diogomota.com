"use server";

import { CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import {
  emailError,
  firstNameError,
  formPassword,
  lastNameError,
  normalizeEmail,
  normalizeName,
  normalizeUsername,
  passwordError,
  usernameError,
} from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { authHref, safeNextPath } from "@/lib/next-path";
import { hashPassword } from "@/lib/password";
import { clientIp, signUpLimit } from "@/lib/rate-limit";
import { createUser } from "@/lib/users";

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const firstName = normalizeName(formData.get("firstName"));
  const lastName = normalizeName(formData.get("lastName"));
  const username = normalizeUsername(formData.get("username"));
  const email = normalizeEmail(formData.get("email"));
  const password = formPassword(formData.get("password"));
  const values = { firstName, lastName, username, email };

  const fieldErrors = {
    firstName: firstNameError(firstName) ?? undefined,
    lastName: lastNameError(lastName) ?? undefined,
    username: usernameError(username) ?? undefined,
    email: emailError(email) ?? undefined,
    password: passwordError(password) ?? undefined,
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors, values };

  // Before hashing, which is the slow part.
  if (!signUpLimit(clientIp(await headers()))) {
    return { error: "Too many sign-ups from your network. Try again in an hour.", values };
  }

  const user = await createUser({ username, email, passwordHash: await hashPassword(password), firstName, lastName });
  if (!user) {
    // Doesn't say whether the username or the email is taken.
    return {
      error:
        "Couldn't sign up with that username and email. Try another username, or log in if you already have an account.",
      values,
    };
  }

  const next = safeNextPath(formData.get("next")) ?? "/apps";
  try {
    // Redirects on success.
    await signIn("credentials", { login: username, password, redirectTo: next });
  } catch (error) {
    // The account exists; only logging in failed (e.g. the login rate limit).
    if (error instanceof CredentialsSignin) redirect(authHref("/login", next));
    throw error;
  }
  return {};
}
