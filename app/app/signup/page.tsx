import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { appViewport } from "@/lib/apps";
import { authHref, safeNextPath } from "@/lib/next-path";

export const metadata: Metadata = { title: "sign up", robots: { index: false } };

export const viewport = appViewport;

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNextPath((await searchParams).next);
  if (await auth()) redirect(next ?? "/apps");

  return (
    <AuthPage title="Sign up" form={<SignUpForm next={next} />}>
      <p>
        Already have an account? <Link href={authHref("/login", next)}>Log in</Link>
      </p>
    </AuthPage>
  );
}
