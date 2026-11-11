"use client";

import { useActionState } from "react";
import { logIn } from "@/app/login/actions";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";

export function LoginForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(logIn, {});

  return (
    <form action={action} noValidate className={formStyles.form}>
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        label="Username or email"
        name="login"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.login}
      />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <FormMessage error={state.error} />
      <SubmitButton label="Log in" pending={pending} wide />
    </form>
  );
}
