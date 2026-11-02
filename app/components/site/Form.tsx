"use client";

import { useId } from "react";
import { Brackets } from "./SitePage";
import site from "./site.module.css";
import styles from "./Form.module.css";

type FieldProps = Omit<React.ComponentProps<"input">, "id" | "className"> & {
  label: string;
  name: string;
  hint?: string;
  error?: string;
};

// A labelled input with a hint, read out with it. An error takes the hint's
// place: the messages restate the rule, so showing both would say it twice.
export function Field({ label, hint, error, ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
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

export function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  return (
    <button type="submit" className={`${site.bracket} ${styles.submit}`} disabled={pending}>
      <Brackets>{pending ? `${label}…` : label}</Brackets>
    </button>
  );
}
