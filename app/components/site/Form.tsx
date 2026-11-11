"use client";

import { useId } from "react";
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
export function Field({ label, hideLabel = false, hint, error, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? ui.srOnly : styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
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
export function SubmitButton({ label, pending, wide = false }: {
  label: string;
  pending: boolean;
  /** As wide as the form: the one thing to do on the page (login, sign up). */
  wide?: boolean;
}) {
  return (
    <button type="submit" className={`${ui.button} ${ui.primary} ${wide ? styles.wide : styles.submit}`}
      disabled={pending} aria-busy={pending || undefined}>
      {label}
      <PendingOverlay pending={pending} />
    </button>
  );
}
