"use client";

import { useActionState } from "react";
import ui from "@/components/common/ui.module.css";
import { EMAIL_MAX, NAME_MAX } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { CONTACT_MESSAGE_MAX } from "@/lib/site";
import { Field, FormMessage, SubmitButton, TextAreaField } from "./Form";
import formStyles from "./Form.module.css";

// A name, an email to reply to and the message, sent to Diogo by email
// (lib/contact-message.ts) without the page showing his address: /about's Get
// in touch, and /report-bug, whose labels are its own. Sent, the message
// empties and a thanks shows; refused, what was typed stays. `defaults` fills
// in the name and email of who is logged in.
export function ContactForm({
  action: send,
  messageLabel = "Message",
  messageHint,
  submitLabel = "Send message",
  defaults,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  messageLabel?: string;
  messageHint?: string;
  submitLabel?: string;
  defaults?: { name?: string | null; email?: string | null };
}) {
  const [state, action, pending] = useActionState(send, {});

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Your name"
        name="name"
        error={state.fieldErrors?.name}
        autoComplete="name"
        required
        maxLength={NAME_MAX}
        defaultValue={state.values?.name ?? defaults?.name ?? undefined}
      />
      <Field
        label="Your email"
        name="email"
        type="email"
        hint="So I can reply to you."
        error={state.fieldErrors?.email}
        autoComplete="email"
        required
        maxLength={EMAIL_MAX}
        defaultValue={state.values?.email ?? defaults?.email ?? undefined}
      />
      <TextAreaField
        label={messageLabel}
        name="message"
        hint={messageHint}
        error={state.fieldErrors?.message}
        required
        maxLength={CONTACT_MESSAGE_MAX}
        defaultValue={state.values?.message}
      />
      {/* For bots, which fill in every field: people never see it, nor tab to it. */}
      <div className={ui.srOnly} aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label={submitLabel} pending={pending} />
    </form>
  );
}
