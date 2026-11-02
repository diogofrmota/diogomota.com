import { createHash, randomBytes } from "node:crypto";
import { query } from "./db";
import { type Email, sendEmail } from "./email";
import { findUserByEmail } from "./users";

// How long an emailed link works. A Postgres interval, also used in the text.
export const RESET_LINK_LIFETIME = "1 hour";

// The token is only ever in the emailed link. password_resets keeps its SHA-256,
// so the table (or a backup of it) holds no working links.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Built on AUTH_URL, never on the request's Host header: a client can set that,
// and would get the victim's link pointing at its own site.
function resetLink(token: string): string {
  const base =
    process.env.AUTH_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!base) throw new Error("AUTH_URL is not set");
  const url = new URL("/reset-password", base);
  url.searchParams.set("token", token);
  return url.href;
}

// Emails a reset link to the account with this email, if there is one. Only the
// newest link works: making one invalidates the account's earlier unused ones.
export async function sendPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  await query(
    `WITH earlier AS (
       UPDATE password_resets SET used = true WHERE user_id = $1 AND NOT used
     )
     INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + $3::interval)`,
    [user.id, hashToken(token), RESET_LINK_LIFETIME],
  );
  await sendEmail({ to: user.email, ...resetEmail(user.username, resetLink(token)) });
}

// The username of the account a token resets, or null when the token is unknown,
// used or expired.
export async function resetTokenUsername(token: string): Promise<string | null> {
  const { rows } = await query<{ username: string }>(
    `SELECT u.username FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = $1 AND NOT r.used AND r.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0]?.username ?? null;
}

// Uses up the token and sets the new password in one statement, so a link works
// once even when submitted twice at the same moment. Setting password_changed_at
// ends the account's sessions (app/auth.ts). Returns false when the token is
// unknown, used or expired.
export async function resetPassword(token: string, passwordHash: string): Promise<boolean> {
  const { rowCount } = await query(
    `WITH reset AS (
       UPDATE password_resets SET used = true
       WHERE token_hash = $1 AND NOT used AND expires_at > now()
       RETURNING user_id
     )
     UPDATE users SET password_hash = $2, password_changed_at = now()
     FROM reset WHERE users.id = reset.user_id`,
    [hashToken(token), passwordHash],
  );
  return rowCount === 1;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// Plain on purpose: a short text version plus minimal HTML with the same words.
function resetEmail(username: string, link: string): Omit<Email, "to"> {
  const intro = "Someone asked to reset the password of your diogomota.com account.";
  const expiry = `The link works once, for ${RESET_LINK_LIFETIME}. If you didn't ask for this, ignore this email: your password stays the same.`;

  const text = [
    `Hi ${username},`,
    "",
    `${intro} To choose a new one, open this link:`,
    "",
    link,
    "",
    expiry,
  ].join("\n");

  const href = escapeHtml(link);
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111111;background:#ffffff;">
<p>Hi ${escapeHtml(username)},</p>
<p>${intro}</p>
<p><a href="${href}" style="color:#111111;">Choose a new password</a></p>
<p style="color:#555555;font-size:14px;">Or open this link: ${href}</p>
<p>${escapeHtml(expiry)}</p>
</body>
</html>`;

  return { subject: "Reset your diogomota.com password", text, html };
}
