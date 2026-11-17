import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { SocialApp } from "@/components/social/SocialApp";
import { appViewport } from "@/lib/apps";
import { socialViews, viewFromParams } from "@/lib/app-views";
import { findUserById } from "@/lib/users";
export const metadata: Metadata = { title: "Social", robots: { index: false, follow: false } };
export const viewport = appViewport;
export default async function SocialPage({ params, searchParams }: PageProps<"/social/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(socialViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/social/${view.join("/")}` : "/social");
  const user = await findUserById(id);
  if (!user) notFound();
  return (
    <SocialApp
      user={{ id, username: user.username, name: user.name, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={initial}
    />
  );
}
