"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import { joinWithLink } from "./actions";

/** Join, for someone logged in: one button, so opening the link never joins by itself. */
export function JoinForm({ code, label }: { code: string; label: string }) {
  const [state, action, pending] = useActionState(joinWithLink, {});
  return (
    <form action={action} className={formStyles.form}>
      <input type="hidden" name="code" value={code} />
      <FormMessage error={state.error} />
      <SubmitButton label={label} pending={pending} wide />
    </form>
  );
}
