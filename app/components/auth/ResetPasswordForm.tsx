"use client";

import { useActionState } from "react";
import { setNewPassword } from "@/app/reset-password/actions";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import { PASSWORD_MIN, passwordHint } from "@/lib/account-rules";

export function ResetPasswordForm({ token, username }: { token: string; username: string }) {
  const [state, action, pending] = useActionState(setNewPassword, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      <input type="hidden" name="token" value={token} />
      {/* Tells password managers which account the new password belongs to. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <Field
        label="New password"
        name="password"
        type="password"
        hint={passwordHint}
        error={errors.password}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        error={errors.confirmPassword}
        autoComplete="new-password"
        required
      />
      <FormMessage error={state.error} />
      <SubmitButton label="Set new password" pending={pending} wide />
    </form>
  );
}
