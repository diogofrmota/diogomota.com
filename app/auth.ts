import "server-only";
import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins/username";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/account-rules";
import { removeAvatar } from "@/lib/avatars";
import { getPool } from "@/lib/db";
import { emailVerificationEmail, resetPasswordEmail } from "@/lib/auth-emails";
import { sendEmail } from "@/lib/email";
import { appsWithNext } from "@/lib/next-path";
import { hashPassword, verifyPassword } from "@/lib/password";
import { resetEmailLimit } from "@/lib/rate-limit";
import { leaveSpaceOf } from "@/lib/spaces";

/**
 * How long an emailed password reset link works, in seconds, and in words for
 * the emails and pages.
 */
export const resetLinkSeconds = 60 * 60;
export const resetLinkLifetime = "1 hour";
/** How long an email confirmation link works. */
const verifyLinkSeconds = 24 * 60 * 60;

/**
 * Better Auth (better-auth.com), on the site's own Postgres tables
 * (016_better_auth.sql): users (with the username plugin's username), accounts
 * (the bcrypt password of each account), sessions and verifications.
 *
 * - Sessions are rows in sessions, read on every request (no cookie cache), so
 *   logging out, a password change or deleting the account ends them at once.
 * - The site's forms are server actions (app/login, app/signup, app/account,
 *   ...) that check their fields and rate limits, then call auth.api. The same
 *   operations over HTTP are switched off (disabledPaths), so nothing gets
 *   around those checks; what stays open are the links in emails
 *   (/api/auth/verify-email, /api/auth/reset-password/:token) and reading or
 *   ending the session.
 * - Passwords stay bcrypt (lib/password.ts), so every existing one still works.
 */
export const auth = betterAuth({
  appName: "diogomota.com",
  baseURL: process.env.AUTH_URL,
  secret: process.env.AUTH_SECRET,
  database: getPool(),
  telemetry: { enabled: false },
  user: {
    modelName: "users",
    fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
    // A new email is only set once its link is opened (sent to the new address).
    changeEmail: { enabled: true },
    deleteUser: {
      enabled: true,
      // Leaves the space first (handing it on, or deleting it if they were its
      // last member), and deletes the profile picture's file. Everything else of
      // theirs goes with the users row (ON DELETE CASCADE).
      beforeDelete: async (user) => {
        await leaveSpaceOf(user.id);
        await removeAvatar(user.id);
      },
    },
  },
  session: {
    modelName: "sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    // Changing the email or password, and deleting the account, ask for the
    // password instead (app/account/actions.ts).
    freshAge: 0,
  },
  account: {
    modelName: "accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verifications",
    fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    // Only the hashes of reset tokens: the table (or a backup of it) holds no working links.
    storeIdentifier: "hashed",
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // bcrypt reads 72 bytes; lib/account-rules.ts refuses longer passwords in bytes too.
    maxPasswordLength: 72,
    autoSignIn: true,
    password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(password, hash) },
    resetPasswordTokenExpiresIn: resetLinkSeconds,
    revokeSessionsOnPasswordReset: true,
    // Only to a confirmed email, and at most 3 an hour per address. Either way
    // the form says the same, so it tells nobody whether an account has it.
    sendResetPassword: async ({ user, token }) => {
      if (!user.emailVerified || !resetEmailLimit(user.email.toLowerCase())) return;
      // Only the newest link works: the account's earlier ones go (reset tokens are
      // the only verifications whose value is a user's id; Better Auth keeps their hash).
      const identifier = createHash("sha256").update(`reset-password:${token}`).digest("base64url");
      await getPool().query("DELETE FROM verifications WHERE value = $1 AND identifier <> $2", [user.id, identifier]);
      const link = new URL("/reset-password", process.env.AUTH_URL);
      link.searchParams.set("token", token);
      await sendEmail({ to: user.email, ...resetPasswordEmail(displayName(user), link.href) });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: verifyLinkSeconds,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...emailVerificationEmail(displayName(user), url) });
    },
  },
  advanced: {
    database: { generateId: "uuid" },
    // nginx sets X-Forwarded-For to exactly the client's address (nginx/nginx.conf).
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/email",
    "/sign-in/username",
    "/is-username-available",
    "/update-user",
    "/change-email",
    "/change-password",
    "/request-password-reset",
    "/reset-password",
    "/verify-password",
    "/delete-user",
    "/delete-user/callback",
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/link-social",
    "/unlink-account",
    "/list-accounts",
    "/account-info",
    "/get-access-token",
    "/refresh-token",
    "/sign-in/social",
    "/callback/:id",
    "/send-verification-email",
  ],
  plugins: [
    username({
      minUsernameLength: USERNAME_MIN,
      maxUsernameLength: USERNAME_MAX,
      // a-z, 0-9 and _ once lowercased, as the database enforces (002_username_format.sql).
      usernameValidator: (value) => /^[a-z0-9_]+$/.test(value),
      validationOrder: { username: "post-normalization" },
      displayUsername: false,
    }),
    // Sets the session cookie from server actions; keep it last.
    nextCookies(),
  ],
});

/** "Diogo", or their username without a name, for the emails. */
function displayName(user: { name?: string | null; username?: string | null; email: string }): string {
  return user.name || user.username || user.email;
}

export type SessionUser = { id: string; username: string; emailVerified: boolean };

/**
 * The logged-in user of this request, or null. Read once per request (React's
 * cache): every page, action and API route asks, and so may their parts.
 */
export const getSession = cache(async (): Promise<{ user: SessionUser } | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as typeof session.user & { username: string };
  return { user: { id: user.id, username: user.username, emailVerified: user.emailVerified } };
});

// The signed-in user. Without a session, redirects to /apps, which offers to
// log in and come back to `path`.
export async function requireUser(path: string): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect(appsWithNext(path));
  return session.user;
}
