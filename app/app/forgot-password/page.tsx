import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { appViewport } from "@/lib/apps";
import { themeOf } from "@/lib/users";

export const metadata: Metadata = { title: "forgot password", robots: { index: false } };

export const viewport = appViewport;

// Open logged in too, in the user's theme: /account links here for users who
// forgot their current password.
export default async function ForgotPasswordPage() {
  const session = await auth();
  return (
    <AuthPage
      title="Forgot password"
      theme={await themeOf(session?.user.id)}
      intro="Enter the email of your account and we'll send you a link to choose a new password."
      form={<ForgotPasswordForm />}
    >
      <p>
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </AuthPage>
  );
}
