"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { emailError, normalizeEmail } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { RESET_LINK_LIFETIME, sendPasswordReset } from "@/lib/password-reset";
import { clientIp, resetEmailLimit, resetRequestLimit } from "@/lib/rate-limit";

// The same answer whether or not an account has the email, so the form can't be
// used to find out who has an account.
const requested = `If an account uses that email, we've sent it a link to reset the password. The link works for ${RESET_LINK_LIFETIME}.`;

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get("email"));
  const values = { email };

  const error = emailError(email);
  if (error) return { fieldErrors: { email: error }, values };

  if (!resetRequestLimit(clientIp(await headers()))) {
    return { error: "Too many reset requests from your network. Try again in an hour.", values };
  }

  // Past the limit for this address nothing is sent (the last link still works),
  // and the answer stays the same.
  if (resetEmailLimit(email.toLowerCase())) {
    // After the response, so it takes as long whether or not the account exists.
    after(async () => {
      try {
        await sendPasswordReset(email);
      } catch (error) {
        console.error("Couldn't send a password reset email", error);
      }
    });
  }

  return { success: requested, values };
}
