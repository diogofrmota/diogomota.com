"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import ui from "./ui.module.css";

// The apps' common parts as components, on ui.module.css: every view of
// Shared, Shows, /apps and /account uses these, so a button or a message looks
// and behaves the same everywhere, and its styles are in one place.

type Variant = "primary" | "danger" | "remove" | "quiet";

/**
 * A button: plain, `primary` (a card's or dialog's main action), `remove` (red
 * text, to start something destructive), `danger` (filled red, to confirm it) or
 * `quiet` (text). `busy` shows it working: disabled, and aria-busy.
 */
export function Button({
  variant,
  busy = false,
  className = "",
  type = "button",
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type={type}
      className={`${ui.button} ${variant ? ui[variant] : ""} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    />
  );
}

/** The classes of a Button, for a link that looks like one. */
export function buttonClass(variant?: Variant, className = ""): string {
  return `${ui.button} ${variant ? ui[variant] : ""} ${className}`;
}

/**
 * Something went wrong: the message, with a red bar, then Retry (when it can be
 * tried again) or a × to dismiss it. An alert for screen readers.
 */
export function Alert({
  children,
  onRetry,
  onDismiss,
  className = "",
}: {
  children: ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`${ui.alert} ${className}`}>
      <p className={ui.alertText}>{children}</p>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
      {onDismiss && (
        <button type="button" className={ui.dismiss} aria-label="Dismiss" onClick={onDismiss}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

/**
 * What an action did (`success`), or why it was refused (`error`), shown where it
 * was done. With `focus`, it takes the focus: the button pressed went away with
 * its row, and this is what is there instead.
 */
export function Notice({
  children,
  error = false,
  focus = false,
  className = "",
}: {
  children: ReactNode;
  error?: boolean;
  focus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus, children]);
  return (
    <p
      ref={ref}
      tabIndex={focus ? -1 : undefined}
      role={error ? "alert" : "status"}
      className={`${error ? ui.alert : ui.success} ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * "Are you sure?", for what can't be undone: the question, then the red button
 * that does it and one that keeps things as they are.
 */
export function Confirm({
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
  className = "",
}: {
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <div className={`${ui.confirm} ${className}`}>
      <p>{children}</p>
      <div className={ui.actions}>
        <Button variant="danger" busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}

/** Text only screen readers get. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className={ui.srOnly}>{children}</span>;
}
