"use server";

import { sendContactForm } from "@/lib/contact-message";
import type { FormState } from "@/lib/form-state";

// /about's Get in touch: a message to Diogo (lib/contact-message.ts).
export async function sendContactMessage(_previous: FormState, formData: FormData): Promise<FormState> {
  return sendContactForm(formData, {
    subject: (name) => `Message from ${name} on diogomota.com`,
    sent: "Thanks! Your message is on its way, and I'll reply to the email you gave.",
    empty: "Write your message.",
    from: "/about",
  });
}
