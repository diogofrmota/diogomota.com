import type { Email } from "./email";

// The account emails (auth.ts): plain on purpose, a short text version plus
// minimal HTML with the same words.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function accountEmail({
  name,
  intro,
  action,
  link,
  outro,
  subject,
}: {
  name: string;
  intro: string;
  action: string;
  link: string;
  outro: string;
  subject: string;
}): Omit<Email, "to"> {
  const text = [`Hi ${name},`, "", `${intro} ${action}:`, "", link, "", outro].join("\n");
  const href = escapeHtml(link);
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111111;background:#ffffff;">
<p>Hi ${escapeHtml(name)},</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${href}" style="color:#111111;">${escapeHtml(action)}</a></p>
<p style="color:#555555;font-size:14px;">Or open this link: ${href}</p>
<p>${escapeHtml(outro)}</p>
</body>
</html>`;
  return { subject, text, html };
}

export function resetPasswordEmail(name: string, link: string): Omit<Email, "to"> {
  return accountEmail({
    name,
    subject: "Reset your diogomota.com password",
    intro: "Someone asked to reset the password of your diogomota.com account.",
    action: "Choose a new password",
    link,
    outro:
      "The link works once, for 1 hour. If you didn't ask for this, ignore this email: your password stays the same.",
  });
}

export function emailVerificationEmail(name: string, link: string): Omit<Email, "to"> {
  return accountEmail({
    name,
    subject: "Confirm your email for diogomota.com",
    intro: "Confirm that this is your email, so it can log in and reset your password.",
    action: "Confirm my email",
    link,
    outro:
      "The link works for 24 hours. If you didn't sign up or change your email on diogomota.com, ignore this email.",
  });
}
