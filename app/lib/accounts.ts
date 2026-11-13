import "server-only";
import { auth } from "@/auth";
import { query } from "./db";
import { verifyPassword } from "./password";
import { findUserById } from "./users";

/**
 * Whether `password` is the user's: checked against their credential account
 * (016_better_auth.sql), as long as a wrong one takes as when there is none.
 */
export async function checkPassword(userId: string, password: string): Promise<boolean> {
  const { rows } = await query<{ password: string | null }>(
    "SELECT password FROM accounts WHERE user_id = $1 AND provider_id = 'credential'",
    [userId],
  );
  return verifyPassword(password, rows[0]?.password ?? null);
}

/**
 * The username of the account an emailed reset link is for, or null when the
 * link is unknown, used or expired. Better Auth keeps only the token's hash
 * (verifications), so it looks it up.
 */
export async function resetTokenUsername(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  const context = await auth.$context;
  const verification = await context.internalAdapter.findVerificationValue(`reset-password:${token}`);
  if (!verification || verification.expiresAt < new Date()) return null;
  return (await findUserById(verification.value))?.username ?? null;
}
