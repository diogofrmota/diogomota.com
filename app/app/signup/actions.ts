"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
import { safeNextPath } from "@/lib/next-path";
import { clientIp, signUpLimit } from "@/lib/rate-limit";

// Signs up and logs straight in. A link to confirm the email is sent at the same
// time (auth.ts): until it is opened, the account works, but password resets
// don't go to that email.
export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const name = normalizeName(formData.get("name"));
  const username = normalizeUsername(formData.get("username"));
  const email = normalizeEmail(formData.get("email"));
  const password = formPassword(formData.get("password"));
  const values = { name, username, email };

  const fieldErrors = {
    name: nameError(name) ?? undefined,
    username: usernameError(username) ?? undefined,
    email: emailError(email) ?? undefined,
    password: passwordError(password) ?? undefined,
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors, values };

  // Before hashing, which is the slow part.
  const requestHeaders = await headers();
  if (!signUpLimit(clientIp(requestHeaders))) {
    return { error: "Too many sign-ups from your network. Try again in an hour.", values };
  }

  try {
    await auth.api.signUpEmail({
      body: { name, username, email, password, callbackURL: "/account?email=confirmed" },
      headers: requestHeaders,
    });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    // Doesn't say whether the username or the email is taken.
    return {
      error:
        "Couldn't sign up with that username and email. Try another username, or log in if you already have an account.",
      values,
    };
  }
  redirect(safeNextPath(formData.get("next")) ?? "/");
}
