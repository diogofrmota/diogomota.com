import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { SocialApp } from "@/components/social/SocialApp";
import { appViewport } from "@/lib/apps";
import { HttpError } from "@/lib/http";
import { socialPerson } from "@/lib/social";
import { findUserById } from "@/lib/users";
export const metadata: Metadata = { title: "Social profile", robots: { index: false, follow: false } };
export const viewport = appViewport;
export default async function FriendProfilePage({ params }: PageProps<"/social/profile/[id]">) {
  const { id: targetId } = await params;
  const { id } = await requireUser(`/social/profile/${targetId}`);
  const user = await findUserById(id);
  if (!user) notFound();
  try {
    await socialPerson(id, targetId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return (
    <SocialApp
      key={targetId}
      user={{ id, username: user.username, name: user.name, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={{ view: "profile", panels: [] }}
      profileId={targetId}
    />
  );
}
