import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { authHref, safeNextPath } from "@/lib/next-path";
import { siteViewport } from "@/lib/site";

export const metadata: Metadata = { title: "sign up", robots: { index: false } };

export const viewport = siteViewport;

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNextPath((await searchParams).next);
  if (await auth()) redirect(next ?? "/apps");

  return (
    <AuthPage title="sign up" form={<SignUpForm next={next} />}>
      <p>
        Already have an account? <Link href={authHref("/login", next)}>Log in</Link>
      </p>
    </AuthPage>
  );
}
