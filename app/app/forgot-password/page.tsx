import type { Metadata } from "next";
import Link from "next/link";
import { AuthPage } from "@/components/auth/AuthPage";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { appViewport } from "@/lib/apps";

export const metadata: Metadata = { title: "forgot password", robots: { index: false } };

export const viewport = appViewport;

// Open logged in too, in the user's theme: /account links here for users who
// forgot their current password.
export default function ForgotPasswordPage() {
  return (
    <AuthPage
      title="Forgot password"
      intro="Enter the email of your account and we'll send you a link to choose a new password."
      form={<ForgotPasswordForm />}
    >
      <p>
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </AuthPage>
  );
}
