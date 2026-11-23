import "server-only";
import { headers } from "next/headers";
import { emailError, nameError, normalizeEmail, normalizeName } from "@/lib/account-rules";
import { emailHtml, escapeHtml, sendEmail } from "@/lib/email";
import type { FormState } from "@/lib/form-state";
import { clientIp, contactLimit } from "@/lib/rate-limit";
import { CONTACT_MESSAGE_MAX, contactEmail } from "@/lib/site";

/** What makes one kind of message: /about's Get in touch, or /report-bug. */
export type MessageKind = {
  /** The email's subject, from the sender's name. */
  subject: (name: string) => string;
  /** The thanks once it's sent. */
  sent: string;
  /** Asked for when the message is empty. */
  empty: string;
  /** Lines about where it came from (the version, the browser), over the message. */
  details?: (requestHeaders: Headers) => Promise<string[]> | string[];
  /** Where it came from, for the log when it can't be sent. */
  from: string;
};

// A message from a form on the site to CONTACT_EMAIL (lib/site.ts), which the
// page never shows: a name, an email and the message. Its Reply-To is the
// sender's email, so answering it goes straight to them. At most 5 an hour per
// network, both forms together; a filled-in `website` (a field people don't
// see, which bots fill in) gets the same thanks and no email.
export async function sendContactForm(formData: FormData, kind: MessageKind): Promise<FormState> {
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
      ? kind.empty
      : message.length > CONTACT_MESSAGE_MAX
        ? `Use at most ${CONTACT_MESSAGE_MAX} characters.`
        : undefined,
  };
  if (fieldErrors.name || fieldErrors.email || fieldErrors.message) return { fieldErrors, values };

  if (formData.get("website")) return { success: kind.sent };

  const requestHeaders = await headers();
  if (!contactLimit(clientIp(requestHeaders))) {
    return { error: "Too many messages from your network. Try again in an hour.", values };
  }

  const from = `From: ${name} <${email}>`;
  const details = [from, ...((await kind.details?.(requestHeaders)) ?? [])];
  try {
    await sendEmail({
      to,
      replyTo: email,
      subject: kind.subject(name),
      text: [...details, "", message].join("\n"),
      html: emailHtml([
        ...details.map((line) => `<p style="margin:0 0 4px;color:#555555;font-size:14px;">${escapeHtml(line)}</p>`),
        `<p style="margin-top:16px;white-space:pre-wrap;">${escapeHtml(message)}</p>`,
      ]),
    });
  } catch (error) {
    console.error(`Couldn't send a message from ${kind.from}`, error);
    return { error: "Your message couldn't be sent. Try again in a moment.", values };
  }

  return { success: kind.sent };
}
