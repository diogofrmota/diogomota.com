import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { appsWithNext } from "@/lib/next-path";
import { verifyPassword } from "@/lib/password";
import { clientIp, loginLimit } from "@/lib/rate-limit";
import { findUserById, findUserForLogin } from "@/lib/users";

// What the session (a signed, encrypted JWT in a cookie) holds: the user's id and
// username, nothing else.
declare module "next-auth" {
  interface Session {
    user: { id: string; username: string };
  }
  interface User {
    username: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    username?: string;
  }
}

/** Thrown from authorize() when an IP has made too many login attempts. */
export class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { login: {}, password: {} },
      // Every way in (the login and sign-up forms, or a POST straight to
      // /api/auth/callback/credentials) passes through here. Returning null
      // fails with the same error whether or not the account exists.
      async authorize(credentials, request) {
        if (!loginLimit(clientIp(request.headers))) throw new RateLimited();

        const { login, password } = credentials;
        if (typeof login !== "string" || typeof password !== "string" || !login || !password) {
          return null;
        }
        const user = await findUserForLogin(login.trim());
        const valid = await verifyPassword(password, user?.passwordHash ?? null);
        return user && valid ? { id: user.id, username: user.username } : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) token.username = user.username;
      // unstable_update() after a username change. The data sent with an update
      // can come from the browser (POST /api/auth/session), so it is ignored and
      // the username is read from the database instead.
      if (trigger === "update" && token.sub) {
        const current = await findUserById(token.sub);
        if (current) token.username = current.username;
      }
      return token;
    },
    session({ session, token }) {
      return { ...session, user: { id: token.sub!, username: token.username! } };
    },
  },
  logger: {
    // A failed login is expected, not an error worth a stack trace in the logs.
    error(error) {
      if (error instanceof CredentialsSignin) return;
      console.error(error);
    },
  },
});

// The signed-in user. Without a session, redirects to /apps, which offers to
// log in and come back to `path`.
export async function requireUser(path: string): Promise<{ id: string; username: string }> {
  const session = await auth();
  if (!session) redirect(appsWithNext(path));
  return session.user;
}
