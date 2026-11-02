import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import { LoginForm } from "@/components/auth/LoginForm";
import { authHref, safeNextPath } from "@/lib/next-path";
import { siteViewport } from "@/lib/site";

export const metadata: Metadata = { title: "login", robots: { index: false } };

export const viewport = siteViewport;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNextPath((await searchParams).next);
  if (await auth()) redirect(next ?? "/apps");

  return (
    <AuthPage title="login" form={<LoginForm next={next} />}>
      <p>
        No account yet? <Link href={authHref("/signup", next)}>Sign up</Link>
      </p>
      {/* Goal 6 turns this into a "Forgot password?" link to the email reset flow. */}
      <p>Forgot your password? Resetting it by email is coming soon.</p>
    </AuthPage>
  );
}
