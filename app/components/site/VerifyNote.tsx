"use client";

import { useActionState } from "react";
import { resendVerification } from "@/app/account/actions";
import { PendingOverlay } from "@/components/common/Spinner";
import ui from "@/components/common/ui.module.css";
import styles from "./VerifyNote.module.css";

/**
 * Over home's apps until the email is confirmed: that a link went to it, and
 * Send it again, which sends another right here (at most 3 an hour,
 * resendVerification) and then says so, rather than going to Account.
 */
export function VerifyNote({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerification, {});
  const sent = !!state.success;
  return (
    <form action={action} className={styles.note}>
      <p>
        Confirm your email (<strong>{email}</strong>) with the link we sent, so you can reset your password if you
        forget it.
      </p>
      <button type="submit" className={ui.button} disabled={pending || sent} aria-busy={pending || undefined}>
        {sent ? "Sent" : "Send it again"}
        <PendingOverlay pending={pending} />
      </button>
      <p role={state.error ? "alert" : "status"} className={state.error ? styles.error : ui.srOnly}>
        {state.error ?? state.success ?? ""}
      </p>
    </form>
  );
}
