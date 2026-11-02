import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppPlaceholder } from "@/components/common/AppPlaceholder";
import { findUserById } from "@/lib/users";

// Placeholder until the Shows app is built. proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Shows", robots: { index: false } };

export default async function ShowsPage() {
  const { id, username } = await requireUser("/shows");
  const user = await findUserById(id);
  if (!user) notFound();

  return <AppPlaceholder name="Shows" username={username} theme={user.themePreference} />;
}
