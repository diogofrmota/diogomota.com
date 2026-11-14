import type { Metadata } from "next";
import Link from "next/link";
import { resetLinkLifetime } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { appViewport } from "@/lib/apps";
import { resetTokenUsername } from "@/lib/accounts";

// The token is in this page's URL, so no Referer header carries it anywhere.
export const metadata: Metadata = {
  title: "reset password",
  robots: { index: false },
  referrer: "no-referrer",
};

export const viewport = appViewport;

// Opened from the link in the reset email (auth.ts, sendResetPassword).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const param = (await searchParams).token;
  const token = typeof param === "string" ? param : "";
  const username = token ? await resetTokenUsername(token) : null;

  if (!username) {
    return (
      <AuthPage
        title="Link expired"
        intro={`This password reset link has expired or was already used. Each link works once, for ${resetLinkLifetime}.`}
        action={{ href: "/forgot-password", label: "Get a new link" }}
      />
    );
  }

  return (
    <AuthPage
      title="Reset password"
      intro={`Choose a new password for ${username}.`}
      form={<ResetPasswordForm token={token} username={username} />}
    >
      <p>
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </AuthPage>
  );
}
