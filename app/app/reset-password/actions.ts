"use server";

import { APIError } from "better-auth";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resetTokenUsername } from "@/lib/accounts";
import { formPassword, passwordError } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";

export async function setNewPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) redirect("/reset-password");
  // Where the page explains that the link has expired or was already used.
  const linkPage = `/reset-password?${new URLSearchParams({ token })}`;

  const password = formPassword(formData.get("password"));
  const confirmPassword = formPassword(formData.get("confirmPassword"));
  const fieldErrors = {
    password: passwordError(password) ?? undefined,
    confirmPassword: confirmPassword === password ? undefined : "The passwords don't match.",
  };
  if (Object.values(fieldErrors).some(Boolean)) return { fieldErrors };

  // Before hashing, which is the slow part.
  if (!(await resetTokenUsername(token))) redirect(linkPage);
  try {
    // Uses up the token and ends every session of the account (auth.ts).
    await auth.api.resetPassword({ body: { newPassword: password, token } });
  } catch (error) {
    if (error instanceof APIError) redirect(linkPage);
    throw error;
  }
  redirect("/login?password=changed");
}
