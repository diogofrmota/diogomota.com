"use server";

import { CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import type { FormState } from "@/lib/form-state";
import { safeNextPath } from "@/lib/next-path";

export async function logIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const login = formData.get("login");
  const password = formData.get("password");
  const values = { login: typeof login === "string" ? login : "" };
  if (!values.login.trim() || typeof password !== "string" || !password) {
    return { error: "Enter your username or email, and your password.", values };
  }

  try {
    // Redirects on success.
    await signIn("credentials", {
      login: values.login,
      password,
      redirectTo: safeNextPath(formData.get("next")) ?? "/apps",
    });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      // One message for an unknown account and a wrong password.
      const message =
        error.code === "rate_limited"
          ? "Too many login attempts. Wait 15 minutes and try again."
          : "Wrong username/email or password.";
      return { error: message, values };
    }
    throw error;
  }
  return {};
}
