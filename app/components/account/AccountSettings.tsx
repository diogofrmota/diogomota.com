"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { changePassword, changeUsername, saveTheme } from "@/app/account/actions";
import { ThemeOptions } from "@/components/common/ThemePicker";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import {
  PASSWORD_MIN,
  normalizeUsername,
  passwordHint,
  USERNAME_MAX,
  USERNAME_MIN,
  usernameHint,
  usernameError,
} from "@/lib/account-rules";
import { ApiError, apiRequest } from "@/lib/api-request";
import type { FormState } from "@/lib/form-state";
import { isTheme, type Theme } from "@/lib/themes";
import styles from "./AccountSettings.module.css";

export function UsernameForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(changeUsername, {});
  const [draft, setDraft] = useState<{ value: string; previous: FormState } | null>(null);
  const [check, setCheck] = useState<{ username: string; available?: boolean; error?: string } | null>(null);
  const statusId = useId();
  const value = draft?.value ?? username;
  const normalized = normalizeUsername(value);
  const validation = draft ? usernameError(normalized) : null;
  const changed = normalized !== username;
  const showSavedResult = !draft || draft.previous !== state;
  const savedError = showSavedResult && state.values?.username === normalized ? state.fieldErrors?.username : undefined;
  const result = check?.username === normalized ? check : null;
  const error = validation || savedError || (changed && result?.available === false ? "That username is taken." : undefined);
  const message = error || (showSavedResult && state.error)
    || (showSavedResult && !changed && state.success)
    || (changed ? result?.error || (result?.available ? "That username is available." : "Checking availability…") : usernameHint);

  useEffect(() => {
    if (!changed || usernameError(normalized)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest<{ available: boolean }>(
          `/api/account/username?${new URLSearchParams({ username: normalized })}`,
          { signal: controller.signal, fallback: "Couldn't check availability. Try again or save to check." },
        );
        if (!controller.signal.aborted) setCheck({ username: normalized, available: data.available });
      } catch (error) {
        if (!controller.signal.aborted) {
          setCheck({ username: normalized, error: error instanceof ApiError ? error.message : "Couldn't check availability. Try again or save to check." });
        }
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [changed, normalized, value]);

  return (
    <form action={action} noValidate className={formStyles.form}>
      <div className={formStyles.field}>
        <Field
          label="Username"
          hideLabel
          name="username"
          aria-describedby={statusId}
          aria-invalid={error ? true : undefined}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          value={value}
          onChange={(event) => {
            setDraft({ value: event.target.value, previous: state });
            setCheck(null);
          }}
        />
        <p id={statusId} role="status" className={error || (changed && result?.error) ? formStyles.error : formStyles.hint}>
          {message}
        </p>
      </div>
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
      <p className={formStyles.hint}>Changing password logs you out on every device.</p>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Change password" pending={pending} />
    </form>
  );
}

// `labelledBy` is the id of the section heading, which names the radio group.
export function ThemeForm({ theme, labelledBy }: { theme: Theme; labelledBy: string }) {
  const [state, action, pending] = useActionState(saveTheme, {});
  const hintId = useId();
  const saved = state.values?.theme;
  const selected = isTheme(saved) ? saved : theme;

  return (
    <form action={action} className={formStyles.form}>
      <fieldset className={styles.fieldset} aria-labelledby={labelledBy} aria-describedby={hintId}>
        <p id={hintId} className={formStyles.hint}>
          Applies to both apps, and to this page.
        </p>
        <ThemeOptions defaultValue={selected} />
      </fieldset>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save theme" pending={pending} />
    </form>
  );
}
