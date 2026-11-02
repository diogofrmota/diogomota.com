import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage } from "@/components/auth/AuthPage";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { MessagePage } from "@/components/site/MessagePage";
import { RESET_LINK_LIFETIME, resetTokenUsername } from "@/lib/password-reset";
import { siteViewport } from "@/lib/site";

// The token is in this page's URL, so no Referer header carries it anywhere.
export const metadata: Metadata = {
  title: "reset password",
  robots: { index: false },
  referrer: "no-referrer",
};

export const viewport = siteViewport;

// Opened from the link in the reset email (lib/password-reset.ts).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const param = (await searchParams).token;
  const token = typeof param === "string" ? param : "";
  const username = token ? await resetTokenUsername(token) : null;

  if (!username) {
    return (
      <MessagePage
        title="link expired"
        message={`This password reset link has expired or was already used. Each link works once, for ${RESET_LINK_LIFETIME}.`}
        link={{ href: "/forgot-password", label: "Get a new link" }}
      />
    );
  }

  return (
    <AuthPage
      title="reset password"
      intro={`Choose a new password for ${username}.`}
      form={<ResetPasswordForm token={token} username={username} />}
    >
      <p>
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </AuthPage>
  );
}
