"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { auth, resetLinkLifetime } from "@/auth";
import { emailError, normalizeEmail } from "@/lib/account-rules";
import type { FormState } from "@/lib/form-state";
import { clientIp, resetRequestLimit } from "@/lib/rate-limit";

// The same answer whether or not an account has the email, so the form can't be
// used to find out who has an account. The link only goes to a confirmed email,
// at most 3 an hour per address (auth.ts, sendResetPassword).
const requested = `If an account uses that email and it is confirmed, we've sent it a link to reset the password. The link works for ${resetLinkLifetime}.`;

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(formData.get("email"));
  const values = { email };

  const error = emailError(email);
  if (error) return { fieldErrors: { email: error }, values };

  if (!resetRequestLimit(clientIp(await headers()))) {
    return { error: "Too many reset requests from your network. Try again in an hour.", values };
  }

  // After the response, so it takes as long whether or not the account exists.
  after(async () => {
    try {
      await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    } catch (error) {
      console.error("Couldn't send a password reset email", error);
    }
  });

  return { success: requested, values };
}
