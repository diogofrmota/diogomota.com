import { Resend } from "resend";
import { testHooksEnabled } from "./test-hooks";

export type Email = { to: string; subject: string; text: string; html: string };

// With test hooks on, emails land here instead of being sent; the e2e tests read
// them from /api/test/outbox. One list across dev hot reloads, like the pg pool.
const globalForOutbox = globalThis as typeof globalThis & { testOutbox?: Email[] };
export const testOutbox = (globalForOutbox.testOutbox ??= []);

// Sends through the Resend API from MAIL_FROM. In development without
// RESEND_API_KEY, prints the email to the server console instead.
export async function sendEmail(email: Email): Promise<void> {
  if (testHooksEnabled()) {
    testOutbox.push(email);
    if (testOutbox.length > 200) testOutbox.shift();
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.log(
      `RESEND_API_KEY is not set, so this email was not sent.\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`,
    );
    return;
  }

  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM is not set");
  // The SDK returns API errors rather than throwing them.
  const { error } = await new Resend(apiKey).emails.send({ from, ...email });
  if (error) throw new Error(`Resend didn't send "${email.subject}": ${error.name}: ${error.message}`);
}
