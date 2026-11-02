"use client";

import { useActionState, useId } from "react";
import { changePassword, changeUsername, saveTheme } from "@/app/account/actions";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import {
  PASSWORD_MIN,
  passwordHint,
  USERNAME_MAX,
  USERNAME_MIN,
  usernameHint,
} from "@/lib/account-rules";
import type { Theme } from "@/lib/users";
import styles from "./AccountSettings.module.css";

export function UsernameForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(changeUsername, {});

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Username"
        name="username"
        hint={usernameHint}
        error={state.fieldErrors?.username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={USERNAME_MIN}
        maxLength={USERNAME_MAX}
        defaultValue={state.values?.username ?? username}
      />
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save username" pending={pending} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        error={errors.currentPassword}
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        hint={passwordHint}
        error={errors.newPassword}
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
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Change password" pending={pending} />
    </form>
  );
}

// `labelledBy` is the id of the section heading, which names the radio group.
export function ThemeForm({ theme, labelledBy }: { theme: Theme; labelledBy: string }) {
  const [state, action, pending] = useActionState(saveTheme, {});
  const hintId = useId();
  const selected = state.values?.theme ?? theme;

  return (
    <form action={action} className={formStyles.form}>
      <fieldset className={styles.fieldset} aria-labelledby={labelledBy} aria-describedby={hintId}>
        <p id={hintId} className={formStyles.hint}>
          Used inside the apps. This page and /apps stay black.
        </p>
        {(["light", "dark"] as const).map((value) => (
          <label key={value} className={styles.radio}>
            <input type="radio" name="theme" value={value} defaultChecked={selected === value} />
            {value === "light" ? "Light" : "Dark"}
          </label>
        ))}
      </fieldset>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save theme" pending={pending} />
    </form>
  );
}
