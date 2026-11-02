"use client";

import { useActionState } from "react";
import { signUp } from "@/app/signup/actions";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import {
  EMAIL_MAX,
  PASSWORD_MIN,
  passwordHint,
  USERNAME_MAX,
  USERNAME_MIN,
  usernameHint,
} from "@/lib/account-rules";

// The constraint attributes are there for password managers and assistive
// tech; noValidate leaves checking to the server, which explains what's wrong.
export function SignUpForm({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState(signUp, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        label="Username"
        name="username"
        hint={usernameHint}
        error={errors.username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={USERNAME_MIN}
        maxLength={USERNAME_MAX}
        defaultValue={state.values?.username}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        error={errors.email}
        autoComplete="email"
        required
        maxLength={EMAIL_MAX}
        defaultValue={state.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        hint={passwordHint}
        error={errors.password}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
      />
      <FormMessage error={state.error} />
      <SubmitButton label="Sign up" pending={pending} />
    </form>
  );
}
