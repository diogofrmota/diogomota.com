"use client";

import { useId, useState } from "react";
import { PendingOverlay } from "@/components/common/Spinner";
import ui from "@/components/common/ui.module.css";
import styles from "./Form.module.css";

type FieldProps = Omit<React.ComponentProps<"input">, "id" | "className"> & {
  label: string;
  /** Only for screen readers, where a heading right over the field already says it. */
  hideLabel?: boolean;
  name: string;
  hint?: string;
  error?: string;
};

// A labelled input with a hint, read out with it. An error takes the hint's
// place: the messages restate the rule, so showing both would say it twice.
// A password field has Show (and then Hide) in it, to check what was typed.
export function Field({ label, hideLabel = false, hint, error, ...input }: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const password = input.type === "password";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const field = (
    <input
      id={id}
      className={styles.input}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      {...input}
      type={password && shown ? "text" : input.type}
    />
  );
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? ui.srOnly : styles.label}>
        {label}
      </label>
      {password ? (
        <span className={styles.password}>
          {field}
          <button type="button" className={styles.reveal} aria-controls={id} onClick={() => setShown(!shown)}>
            {shown ? "Hide" : "Show"}
            <span className={ui.srOnly}> password</span>
          </button>
        </span>
      ) : (
        field
      )}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

// The outcome of the last submit: an error, or a confirmation that it was saved.
export function FormMessage({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {success && (
        <p role="status" className={styles.success}>
          {success}
        </p>
      )}
    </>
  );
}

// While the form is sent: a ring turns over the label, which stays the
// button's name, and the button can't be pressed again.
export function SubmitButton({
  label,
  pending,
  wide = false,
  danger = false,
}: {
  label: string;
  pending: boolean;
  /** As wide as the form: the one thing to do on the page (login, sign up). */
  wide?: boolean;
  /** Filled red: it does something that can’t be undone (deleting the account). */
  danger?: boolean;
}) {
  return (
    <button
      type="submit"
      className={`${ui.button} ${danger ? ui.danger : ui.primary} ${wide ? styles.wide : styles.submit}`}
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {label}
      <PendingOverlay pending={pending} />
    </button>
  );
}
