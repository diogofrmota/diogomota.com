import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { ShowsApp } from "@/components/shows/ShowsApp";
import { appViewport } from "@/lib/apps";
import { HttpError } from "@/lib/http";
import { socialPerson } from "@/lib/social";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Shows", robots: { index: false, follow: false } };
export const viewport = appViewport;

// A friend's shows profile: only accepted friends (and yourself) are found.
export default async function FriendProfilePage({ params }: PageProps<"/shows/profile/[id]">) {
  const { id: targetId } = await params;
  const { id } = await requireUser(`/shows/profile/${targetId}`);
  const user = await findUserById(id);
  if (!user) notFound();
  try {
    await socialPerson(id, targetId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return (
    <ShowsApp
      key={targetId}
      user={{ id, username: user.username, name: user.name, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={{ view: "profile", panels: [] }}
      version={process.env.APP_VERSION ?? "dev"}
      profileId={targetId}
    />
  );
}
