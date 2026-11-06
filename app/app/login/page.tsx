import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import { LoginForm } from "@/components/auth/LoginForm";
import { appViewport } from "@/lib/apps";
import { authHref, safeNextPath } from "@/lib/next-path";

export const metadata: Metadata = { title: "login", robots: { index: false } };

export const viewport = appViewport;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await auth()) redirect(next ?? "/apps");

  return (
    <AuthPage
      title="Login"
      // Where a password reset or change sends the user, logged out everywhere.
      intro={params.password === "changed" ? "Your password was changed. Log in with the new one." : undefined}
      form={<LoginForm next={next} />}
    >
      <p>
        No account yet? <Link href={authHref("/signup", next)}>Sign up</Link>
      </p>
      <p>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </AuthPage>
  );
}
