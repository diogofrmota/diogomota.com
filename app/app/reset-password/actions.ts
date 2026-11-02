"use server";

import { redirect } from "next/navigation";
import { formPassword, passwordError } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { hashPassword } from "@/lib/password";
import { resetPassword, resetTokenUsername } from "@/lib/password-reset";

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
  if (!(await resetPassword(token, await hashPassword(password)))) redirect(linkPage);

  // The reset ended every session of the account, so this logs in afresh.
  redirect("/login?password=changed");
}
