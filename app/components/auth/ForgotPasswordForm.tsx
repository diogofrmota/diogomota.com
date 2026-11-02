"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/forgot-password/actions";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import { EMAIL_MAX } from "@/lib/account-rules";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Email"
        name="email"
        type="email"
        error={state.fieldErrors?.email}
        autoComplete="email"
        required
        maxLength={EMAIL_MAX}
        defaultValue={state.values?.email}
      />
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Send reset link" pending={pending} />
    </form>
  );
}
