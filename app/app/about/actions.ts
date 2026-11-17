"use server";

import { headers } from "next/headers";
import { emailError, nameError, normalizeEmail, normalizeName } from "@/lib/account-rules";
import { sendEmail } from "@/lib/email";
import type { FormState } from "@/lib/form-state";
import { clientIp, contactLimit } from "@/lib/rate-limit";
import { CONTACT_MESSAGE_MAX, contactEmail } from "@/lib/site";

const sent = "Thanks! Your message is on its way, and I'll reply to the email you gave.";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// /about's Get in touch: a message to CONTACT_EMAIL (lib/site.ts), which the
// page never shows. Its Reply-To is the sender's email, so answering it goes
// straight to them. At most 5 an hour per network; a filled-in `website` (a
// field people don't see, which bots fill in) gets the same thanks and no email.
export async function sendContactMessage(_previous: FormState, formData: FormData): Promise<FormState> {
  const to = contactEmail();
  if (!to) return { error: "Messages can't be sent right now. Try again later." };

  const name = normalizeName(formData.get("name"));
  const email = normalizeEmail(formData.get("email"));
  const raw = formData.get("message");
  // Browsers send a textarea's line breaks as \r\n: one \n each, as the field counted them.
  const message = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  const values = { name, email, message };

  const fieldErrors = {
    name: nameError(name) ?? undefined,
    email: emailError(email) ?? undefined,
    message: !message
      ? "Write your message."
      : message.length > CONTACT_MESSAGE_MAX
        ? `Use at most ${CONTACT_MESSAGE_MAX} characters.`
        : undefined,
  };
  if (fieldErrors.name || fieldErrors.email || fieldErrors.message) return { fieldErrors, values };

  if (formData.get("website")) return { success: sent };

  if (!contactLimit(clientIp(await headers()))) {
    return { error: "Too many messages from your network. Try again in an hour.", values };
  }

  try {
    await sendEmail({
      to,
      replyTo: email,
      subject: `Message from ${name} on diogomota.com`,
      text: [`From: ${name} <${email}>`, "", message].join("\n"),
      html: `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111111;background:#ffffff;">
<p style="color:#555555;font-size:14px;">From: ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
<p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
</body>
</html>`,
    });
  } catch (error) {
    console.error("Couldn't send a message from /about", error);
    return { error: "Your message couldn't be sent. Try again in a moment.", values };
  }

  return { success: sent };
}
