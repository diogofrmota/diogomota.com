"use server";

import { getUser } from "@/auth";
import { sendContactForm } from "@/lib/contact-message";
import type { FormState } from "@/lib/form-state";

// /report-bug: what went wrong, to Diogo (lib/contact-message.ts), with what
// helps find it over the message: the account (logged in), which build is live
// and the browser (its user agent), as the page says.
export async function sendBugReport(_previous: FormState, formData: FormData): Promise<FormState> {
  return sendContactForm(formData, {
    subject: (name) => `Bug report from ${name} on diogomota.com`,
    sent: "Thanks! Your report is on its way, and I'll reply to the email you gave if I need to know more.",
    empty: "Describe the bug.",
    details: async (requestHeaders) => {
      const user = await getUser();
      return [
        `Account: ${user ? `@${user.username}` : "not logged in"}`,
        // The image's Docker Hub version tag (Dockerfile, deploy.yml); unset outside the image.
        `Version: ${process.env.APP_VERSION ?? "dev"}`,
        `Browser: ${requestHeaders.get("user-agent")?.slice(0, 300) || "unknown"}`,
      ];
    },
    from: "/report-bug",
  });
}
