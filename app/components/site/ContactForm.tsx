"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/app/about/actions";
import ui from "@/components/common/ui.module.css";
import { EMAIL_MAX, NAME_MAX } from "@/lib/account-rules";
import { CONTACT_MESSAGE_MAX } from "@/lib/site";
import { Field, FormMessage, SubmitButton, TextAreaField } from "./Form";
import formStyles from "./Form.module.css";

// /about's Get in touch: a name, an email to reply to and the message, sent to
// Diogo by email (app/about/actions.ts) without the page showing his address.
// Sent, the fields empty and a thanks shows; refused, what was typed stays.
export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactMessage, {});

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Your name"
        name="name"
        error={state.fieldErrors?.name}
        autoComplete="name"
        required
        maxLength={NAME_MAX}
        defaultValue={state.values?.name}
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
        defaultValue={state.values?.email}
      />
      <TextAreaField
        label="Message"
        name="message"
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
      <SubmitButton label="Send message" pending={pending} />
    </form>
  );
}
